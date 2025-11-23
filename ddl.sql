
CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    pet_name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    breed VARCHAR(100) NOT NULL,
    color VARCHAR(50) NOT NULL,
    neighborhood VARCHAR(100) NOT NULL,
    accessory VARCHAR(255),
    location_reference VARCHAR(255),
    whatsapp VARCHAR(20),
    instagram VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pet_age INTEGER,
    password TEXT,
    adress TEXT
);

CREATE TABLE images (
    id SERIAL PRIMARY KEY,
    image_url VARCHAR(255) NOT NULL,
    post_id INTEGER NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
