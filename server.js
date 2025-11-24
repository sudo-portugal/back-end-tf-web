import express from "express";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from 'fs/promises';
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.static(path.join(__dirname)));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'public', 'uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

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

app.post('/lost_dog_posts', upload.array('images'), async (req, res) => {
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
  } = req.body;

  const files = req.files;

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

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'Você deve enviar pelo menos uma imagem.' });
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

    for (const file of files) {
      const imageUrl = `/uploads/${file.filename}`;

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

app.delete('/lost_dog_posts/:id', async (req, res) => {
  const { id } = req.params;
  // A correção está aqui: a senha é pega dos query parameters (ex: ?password=...)
  const { password } = req.query;

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

    const imageQuery = 'SELECT image_url FROM post_images WHERE post_id = $1';
    const imagesResult = await client.query(imageQuery, [id]);
    const imageUrls = imagesResult.rows.map(row => row.image_url);

    await client.query('DELETE FROM post_images WHERE post_id = $1', [id]);
    
    await client.query('DELETE FROM lost_dog_posts WHERE id = $1', [id]);

    await client.query('COMMIT');

    for (const url of imageUrls) {
      try {
        const filename = url.split('/').pop();
        const filePath = path.join(__dirname, 'public', 'uploads', filename);
        await fs.unlink(filePath);
      } catch (fileErr) {
        console.error(`Erro ao deletar arquivo ${url}:`, fileErr.message);
      }
    }
    
    res.status(200).json({ message: 'Post deletado com sucesso.' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao deletar post:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  } finally {
    client.release();
  }
});

app.put('/lost_dog_posts/:id', async (req, res) => {
  const { id } = req.params;
  const { pet_name } = req.body;

  if (!pet_name) {
    return res.status(400).json({ error: "O campo pet_name é obrigatório." });
  }

  try {
    const result = await pool.query(
      `UPDATE lost_dog_posts SET pet_name = $1 WHERE id = $2 RETURNING id, pet_name`,
      [pet_name, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Post não encontrado." });
    }

    res.status(200).json({
      message: "Nome atualizado com sucesso!",
      updated: result.rows[0]
    });

  } catch (error) {
    console.error("Erro ao atualizar o nome:", error);
    res.status(500).json({ error: "Erro interno do servidor." });
  }
});

app.listen(port, () => {
  console.log(`Serviço rodando na porta: ${port}`);
});