import express from "express";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
// import multer from "multer"; // REMOVIDO: Não funciona em Serverless
// import fs from 'fs/promises'; // REMOVIDO: Não funciona em Serverless
// import path from "path"; // REMOVIDO
// import { fileURLToPath } from "url"; // REMOVIDO

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const { Pool } = pkg;

// --- Middlewares ---
app.use(express.json()); // Único middleware necessário para a API (JSON)
// --------------------

// --- Configuração do Banco de Dados ---
const pool = new Pool({
  connectionString: process.env.URL_BD,
  ssl: {
    rejectUnauthorized: false,
  },
});

// =======================================================
// ROTA PRINCIPAL
// =======================================================
app.get("/", async (req, res) => {
  console.log("Rota GET / solicitada");
  let dbStatus = "ok";
  try {
    await pool.query("SELECT 1");
  } catch (e) {
    dbStatus = e.message;
  }
  res.json({
    descricao: "API para MeuCachorroTaSumido (Serverless Ready)",
    autor: "Indivíduos Computaria",
    statusBD: dbStatus
  });
});

// =======================================================
// ROTA PARA CRIAR NOVOS POSTS (RECEBE URLS NO BODY)
// =======================================================
app.post('/lost_dog_posts', async (req, res) => { // REMOVIDO: upload.array('images')
  
  // 1. Os dados de TEXTO vêm de 'req.body'
  const {
    pet_name,
    description,
    breed,
    color,
    neighborhood,
    accessory,
    location_reference,
    whatsapp,
    instagram,
    pet_age,
    password,
    adress,
    // 💥 MUDANÇA: Agora esperamos um array de URLs
    image_urls // O frontend deve enviar isso
  } = req.body;

  // 2. Validação
  if (!pet_name || !description || !breed || !color || !neighborhood || !password) {
    return res.status(400).json({
      error: 'Campos obrigatórios faltando: pet_name, description, breed, color, neighborhood, password.',
    });
  }
  if (!whatsapp && !instagram) {
    return res.status(400).json({
      error: 'Você deve fornecer pelo menos um método de contato (WhatsApp ou Instagram).',
    });
  }

  // 💥 MUDANÇA: Verifica se recebeu URLs de imagem
  if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
    return res.status(400).json({ error: 'Você deve enviar pelo menos uma URL de imagem no array image_urls.' });
  }

  // 3. Iniciar a Transação com o banco
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 4. Criptografar a senha
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 5. Inserir os dados de TEXTO na tabela 'lost_dog_posts'
    const insertPostQuery = `
      INSERT INTO lost_dog_posts (
        pet_name, description, breed, color, neighborhood, 
        accessory, location_reference, whatsapp, instagram, 
        pet_age, password, adress
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id; 
    `;
    const postValues = [
      pet_name,
      description,
      breed,
      color,
      neighborhood,
      accessory,
      location_reference,
      whatsapp,
      instagram,
      pet_age,
      hashedPassword,
      adress,
    ];

    const postResult = await client.query(insertPostQuery, postValues);
    const newPostId = postResult.rows[0].id; 

    // 6. Salvar as URLs das imagens no banco 'post_images'
    for (const url of image_urls) {
      // Salva a URL (completa do Cloudinary/S3, não mais local) no banco
      const insertImageQuery = `
        INSERT INTO post_images (post_id, image_url)
        VALUES ($1, $2)
      `;
      await client.query(insertImageQuery, [newPostId, url]);
    }

    // 7. Commit
    await client.query('COMMIT');

    // 8. Resposta
    res.status(201).json({
      message: "Post criado com sucesso!",
      postId: newPostId,
      images: image_urls,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar post:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  } finally {
    client.release();
  }
}); 


// =======================================================
// ROTA PARA DELETAR UM POST (REMOVIDA LÓGICA FS)
// =======================================================
app.delete('/lost_dog_posts/:id', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body; 

  if (!password) {
    return res.status(400).json({ error: 'Senha é obrigatória.' });
  }

  const client = await pool.connect();

  try {
    // 1. Buscar o post e a senha HASHED dele
    const selectQuery = 'SELECT password FROM lost_dog_posts WHERE id = $1';
    const postResult = await client.query(selectQuery, [id]);

    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post não encontrado.' });
    }

    const storedHashedPassword = postResult.rows[0].password;

    // 2. Comparar a senha
    const isMatch = await bcrypt.compare(password, storedHashedPassword);

    if (!isMatch) {
      return res.status(403).json({ error: 'Senha incorreta.' });
    }

    // 3. Deletar o post (em uma transação)
    await client.query('BEGIN');

    // 💥 MUDANÇA: Não precisamos pegar as URLs para deletar do disco local
    // Mas o frontend deve ser notificado que o post foi deletado para que
    // as imagens sejam removidas do serviço de armazenamento (se necessário).
    
    // 3a. Deletar as referências das imagens no banco
    await client.query('DELETE FROM post_images WHERE post_id = $1', [id]);
    
    // 3b. Deletar o post principal
    await client.query('DELETE FROM lost_dog_posts WHERE id = $1', [id]);

    // 3c. Confirmar a transação
    await client.query('COMMIT');
    
    // 💥 REMOVIDA A LÓGICA DE fs.unlink()

    res.status(200).json({ message: 'Post deletado com sucesso.' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao deletar post:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  } finally {
    client.release();
  }
});

// Todas as outras rotas (GET, PUT) permanecem as mesmas
app.get('/lost_dog_posts', async (req, res) => { /* ... */ });
app.get('/lost_dog_posts/:id', async (req, res) => { /* ... */ });
app.put('/lost_dog_posts/:id', async (req, res) => { /* ... */ });
// Insira o código completo das rotas que não mudaram aqui.


// =======================================================
// 💥 MUDANÇA CRÍTICA: EXPORTAÇÃO PARA VERCEL
// =======================================================

// Remova esta linha que inicia um servidor tradicional:
// app.listen(port, () => { console.log(`Serviço rodando na porta: ${port}`); });

// Adicione a exportação padrão que o Vercel espera:
export default app;