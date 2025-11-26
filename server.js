import express from "express";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const { Pool } = pkg;

// Remove a necessidade de __filename e __dirname para um back-end de API pura.
// Remove todas as configurações do Multer e middlewares de arquivos estáticos.

app.use(express.json()); 
// Se o front-end estiver em um domínio diferente, você precisará de CORS aqui.
// Ex: import cors from 'cors'; app.use(cors());

const pool = new Pool({
  connectionString: process.env.URL_BD,
  ssl: {
    rejectUnauthorized: false,
  },
});

app.get("/", async (req, res) => {
  let dbStatus = "ok";
  try {
    await pool.query("SELECT 1");
  } catch (e) {
    dbStatus = e.message;
  }
  res.json({
    descricao: "API para MeuCachorroTaSumido",
    autor: "Indivíduos Computaria",
    statusBD: dbStatus
  });
});

app.get('/lost_dog_posts', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id, p.pet_name, p.description, p.breed, p.color, p.neighborhood,
        p.accessory, p.location_reference, p.whatsapp, p.instagram,
        p.created_at, p.pet_age, p.adress,
        COALESCE(
          (SELECT json_agg(json_build_object('id', i.id, 'url', i.image_url))
            FROM post_images i WHERE i.post_id = p.id),
          '[]'::json
        ) as images
      FROM lost_dog_posts p
      ORDER BY p.created_at DESC
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar posts:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ROTA POST: Adaptada para receber JSON com o array de URLs/UUIDs do Uploadcare
app.post('/lost_dog_posts', async (req, res) => {
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
    images_urls // Array de strings de URL do Uploadcare (vindo do JSON)
  } = req.body;

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

  // Validação: deve ter URLs do Uploadcare
  if (!images_urls || !Array.isArray(images_urls) || images_urls.length === 0) {
    return res.status(400).json({ error: 'Você deve enviar pelo menos uma imagem (URL do Uploadcare).' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

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

    const uploadedImageUrls = [];

    // Salvar as URLs do Uploadcare no banco
    for (const imageUrl of images_urls) {
      uploadedImageUrls.push(imageUrl);

      const insertImageQuery = `
        INSERT INTO post_images (post_id, image_url)
        VALUES ($1, $2)
      `;
      await client.query(insertImageQuery, [newPostId, imageUrl]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: "Post criado com sucesso!",
      postId: newPostId,
      images: uploadedImageUrls,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar post:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  } finally {
    client.release();
  }
});

app.get('/lost_dog_posts/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT 
        p.id, p.pet_name, p.description, p.breed, p.color, p.neighborhood,
        p.accessory, p.location_reference, p.whatsapp, p.instagram,
        p.created_at, p.pet_age, p.adress,
        COALESCE(
          (SELECT json_agg(json_build_object('id', i.id, 'url', i.image_url))
            FROM post_images i WHERE i.post_id = p.id),
          '[]'::json
        ) as images
      FROM lost_dog_posts p
      WHERE p.id = $1;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post não encontrado.' });
    }

    res.status(200).json(result.rows[0]);

  } catch (err) {
    console.error('Erro ao buscar post individual:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ROTA DELETE: Removida a lógica de deletar arquivos locais
app.delete('/lost_dog_posts/:id', async (req, res) => {
  const { id } = req.params;
  // A senha deve vir no corpo (req.body) para o delete ser seguro
  const { password } = req.body; 

  if (!password) {
    return res.status(400).json({ error: 'Senha é obrigatória.' });
  }

  const client = await pool.connect();

  try {
    const selectQuery = 'SELECT password FROM lost_dog_posts WHERE id = $1';
    const postResult = await client.query(selectQuery, [id]);

    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post não encontrado.' });
    }

    const storedHashedPassword = postResult.rows[0].password;
    const isMatch = await bcrypt.compare(password, storedHashedPassword);

    if (!isMatch) {
      return res.status(403).json({ error: 'Senha incorreta.' });
    }

    await client.query('BEGIN');

    // Deleta as referências das imagens no banco de dados (o Uploadcare mantém os arquivos)
    await client.query('DELETE FROM post_images WHERE post_id = $1', [id]);
    
    // Deleta o post principal
    await client.query('DELETE FROM lost_dog_posts WHERE id = $1', [id]);

    await client.query('COMMIT');
    
    res.status(200).json({ message: 'Post deletado com sucesso.' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao deletar post:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  } finally {
    client.release();
  }
});

// ROTA PUT: Adaptada para não usar o Multer (multipart/form-data)
// Se a imagem puder ser atualizada aqui, você precisará de uma nova rota PUT separada para isso.
app.put('/lost_dog_posts/:id', async (req, res) => {
  const postId = req.params.id;

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
    images_urls // Se este campo for enviado, você pode atualizá-lo.
  } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Senha é obrigatória para editar o post.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Buscar post original e verificar senha
    const originalPost = await client.query(
      'SELECT password FROM lost_dog_posts WHERE id = $1',
      [postId]
    );

    if (originalPost.rows.length === 0) {
      return res.status(404).json({ error: 'Post não encontrado.' });
    }

    const validPassword = await bcrypt.compare(password, originalPost.rows[0].password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    // 2. Atualizar post (usando COALESCE para manter valores antigos se não forem enviados)
    const updateQuery = `
      UPDATE lost_dog_posts SET
        pet_name = COALESCE($1, pet_name),
        description = COALESCE($2, description),
        breed = COALESCE($3, breed),
        color = COALESCE($4, color),
        neighborhood = COALESCE($5, neighborhood),
        accessory = COALESCE($6, accessory),
        location_reference = COALESCE($7, location_reference),
        whatsapp = COALESCE($8, whatsapp),
        instagram = COALESCE($9, instagram),
        pet_age = COALESCE($10, pet_age),
        adress = COALESCE($11, adress)
      WHERE id = $12;
    `;

    await client.query(updateQuery, [
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
      adress,
      postId
    ]);

    // 3. Se houver URLs de imagem, sobrescrever as imagens antigas
    if (images_urls && Array.isArray(images_urls) && images_urls.length > 0) {
      // Deletar referências antigas
      await client.query('DELETE FROM post_images WHERE post_id = $1', [postId]);

      // Inserir novas referências
      for (const imageUrl of images_urls) {
        await client.query(`
          INSERT INTO post_images (post_id, image_url)
          VALUES ($1, $2)
        `, [postId, imageUrl]);
      }
    }

    await client.query('COMMIT');

    res.json({
      message: 'Post atualizado com sucesso!',
      updated_id: postId
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar post.' });
  } finally {
    client.release();
  }
});

app.listen(port, () => {
  console.log(`Serviço rodando na porta: ${port}`);
});