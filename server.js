import express from "express";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import cors from 'cors';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const { Pool } = pkg;

app.use(express.json()); 
app.use(cors()); 

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
  const client = await pool.connect();
  try {
    const { breed, neighborhood, color } = req.query;

    let query = `
      SELECT 
        p.id, p.pet_name, p.description, p.breed, p.color, p.neighborhood,
        p.accessory, p.location_reference, p.whatsapp, p.instagram,
        p.created_at, p.pet_age, p.adress,
        COALESCE(
          (SELECT json_agg(json_build_object('id', i.id, 'url', i.image_url))
            FROM post_images i WHERE i.post_id = p.id),
          '[]'::json) AS images
      FROM lost_dog_posts p
    `;
    
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (breed) {
      conditions.push(`p.breed ILIKE $${paramIndex++}`);
      values.push(`%${breed}%`); 
    }

    if (neighborhood) {
      conditions.push(`p.neighborhood ILIKE $${paramIndex++}`);
      values.push(`%${neighborhood}%`);
    }

    if (color) {
      conditions.push(`p.color ILIKE $${paramIndex++}`);
      values.push(`%${color}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY p.created_at DESC';

    const result = await client.query(query, values);

    res.status(200).json(result.rows);

  } catch (err) {
    console.error('Erro ao buscar posts com filtro:', err);
    res.status(500).json({ error: 'Erro interno ao buscar posts.' });
  } finally {
    client.release();
  }
});

app.post('/lost_dog_posts', async (req, res) => {
  const { pet_name, description, breed, color, neighborhood, accessory, location_reference, whatsapp, instagram, password, pet_age, adress, images_urls } = req.body;

  if (images_urls && images_urls.length > 5) {
    return res.status(400).json({ error: "O limite máximo é de 5 imagens." });
  }

  if (!pet_name || !description || !breed || !color || !neighborhood || !whatsapp || !password || !images_urls || images_urls.length === 0) {
    return res.status(400).json({ error: "Preencha todos os campos obrigatórios, incluindo ao menos uma imagem e a senha." });
  }

  const cleanWhatsapp = whatsapp.replace(/\D/g, '');
  if (cleanWhatsapp.length < 10 || cleanWhatsapp.length > 11) {
    return res.status(400).json({ error: "Número de WhatsApp inválido." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hashedPassword = await bcrypt.hash(password, 10);

    const insertPostQuery = `
      INSERT INTO lost_dog_posts 
      (pet_name, description, breed, color, neighborhood, accessory, location_reference, whatsapp, instagram, password, pet_age, adress)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
      RETURNING id;
    `;

    const result = await client.query(insertPostQuery, [
      pet_name, description, breed, color, neighborhood, accessory || null, location_reference || null, cleanWhatsapp, instagram || null, hashedPassword, pet_age || null, adress || null
    ]);

    const newPostId = result.rows[0].id;

    for (const imageUrl of images_urls) {
      const insertImageQuery = `
        INSERT INTO post_images (post_id, image_url)
        VALUES ($1, $2);
      `;
      await client.query(insertImageQuery, [newPostId, imageUrl]);
    }

    await client.query('COMMIT');

    res.status(201).json({ 
      message: 'Post criado com sucesso!', 
      post_id: newPostId 
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar post:', err);
    res.status(500).json({ error: 'Erro interno do servidor ao criar post.' });
  } finally {
    client.release();
  }
});

app.get('/lost_dog_posts/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const postQuery = `
      SELECT 
        p.id, p.pet_name, p.description, p.breed, p.color, p.neighborhood,
        p.accessory, p.location_reference, p.whatsapp, p.instagram,
        p.created_at, p.pet_age, p.adress, p.password,
        COALESCE(
          (SELECT json_agg(json_build_object('id', i.id, 'url', i.image_url))
            FROM post_images i WHERE i.post_id = p.id),
          '[]'::json) AS images
      FROM lost_dog_posts p
      WHERE p.id = $1;
    `;
    const postResult = await client.query(postQuery, [id]);

    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: "Post não encontrado." });
    }

    const post = postResult.rows[0];
    delete post.password; 

    res.status(200).json(post);

  } catch (err) {
    console.error('Erro ao buscar post por ID:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  } finally {
    client.release();
  }
});

app.delete('/lost_dog_posts/:id', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: "Senha de exclusão é obrigatória." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passwordResult = await client.query('SELECT password FROM lost_dog_posts WHERE id = $1', [id]);

    if (passwordResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Post não encontrado.' });
    }

    const hashedPassword = passwordResult.rows[0].password;

    const isPasswordCorrect = await bcrypt.compare(password, hashedPassword);
    if (!isPasswordCorrect) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Senha incorreta. Não é possível deletar.' });
    }
    
    await client.query('DELETE FROM post_images WHERE post_id = $1', [id]);
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

app.put('/lost_dog_posts/:id', async (req, res) => {
  const { id } = req.params;
  const { pet_name, description, breed, color, neighborhood, accessory, location_reference, whatsapp, instagram, password, pet_age, adress, images_urls } = req.body;

  if (images_urls && images_urls.length > 5) {
    return res.status(400).json({ error: "O limite máximo é de 5 imagens." });
  }

  if (!password) {
    return res.status(400).json({ error: "A senha é obrigatória para atualização." });
  }

  let cleanWhatsapp = whatsapp;
  if (whatsapp) {
      cleanWhatsapp = whatsapp.replace(/\D/g, '');
      if (cleanWhatsapp.length < 10 || cleanWhatsapp.length > 11) {
        return res.status(400).json({ error: "Número de WhatsApp inválido." });
      }
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passwordResult = await client.query('SELECT password FROM lost_dog_posts WHERE id = $1', [id]);

    if (passwordResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Post não encontrado.' });
    }

    const hashedPassword = passwordResult.rows[0].password;
    const isPasswordCorrect = await bcrypt.compare(password, hashedPassword);
    
    if (!isPasswordCorrect) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Senha incorreta. Não é possível atualizar o post.' });
    }

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
      cleanWhatsapp,
      instagram,
      pet_age,
      adress,
      id
    ]);

    if (images_urls && Array.isArray(images_urls)) {
      await client.query('DELETE FROM post_images WHERE post_id = $1', [id]);

      for (const imageUrl of images_urls) {
        await client.query(`
          INSERT INTO post_images (post_id, image_url)
          VALUES ($1, $2)
        `, [id, imageUrl]);
      }
    }

    await client.query('COMMIT');

    res.json({
      message: 'Post atualizado com sucesso!',
      updated_id: id
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar post:', err);
    res.status(500).json({ error: 'Erro interno do servidor ao atualizar post.' });
  } finally {
    client.release();
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});