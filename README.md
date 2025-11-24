# Indivíduos Computaria 😈

### Integrantes

Eduardo Portugal Souza Rocha | [sudo-portugal 🔗](https://github.com/sudo-portugal)  
Giovanne De Santana Pereira | [dinuncaerra 🔗](https://github.com/dinuncaerra)  
Jhonnatan Diogo Rodrigues Nunes | [Jhonatan1234j 🔗](https://github.com/Jhonatan1234j)  
Ryan Gabriel Gonçalves Silva | [PadeirinOfCodes 🔗](https://github.com/PadeirinOfCodes)  
Vitor Emanuel Rodrigues de Oliveira | [verpyre 🔗](https://github.com/verpyre)  

# 🐶 API -- Endpoints do MeuCachorroTáSumido

## 🟢 **Endpoints de Busca (GET)**

  -------------------------------------------------------------------------------
  Método   Endpoint            Descrição
  -------- ------------------- --------------------------------------------------
  GET      `/lost_dog_posts`   Retorna todos os posts de cachorros perdidos e
                               encontrados.

  -------------------------------------------------------------------------------

------------------------------------------------------------------------

## 🟡 **Endpoint de Cadastro (POST)**

  -------------------------------------------------------------------------------
  Método   Endpoint            Descrição
  -------- ------------------- --------------------------------------------------
  POST     `/lost_dog_posts`   Cadastra um novo post de cachorro
                               perdido/encontrado.

  -------------------------------------------------------------------------------

### 📦 Corpo da Requisição (multipart/form-data)

Este endpoint aceita um corpo **multipart/form-data**, contendo campos
de texto e um arquivo de imagem.

### 📄 Exemplo de JSON (ilustrativo)

``` json
{
  "pet_name": "Rex",
  "description": "Cachorro encontrado na praça central, parece ser de raça pequena.",
  "breed": "Vira-lata",
  "color": "Marrom",
  "neighborhood": "Centro",
  "accessory": "Coleira vermelha",
  "location_reference": "Perto da padaria do João",
  "whatsapp": "+5511999999999",
  "instagram": "@rex_found",
  "pet_age": 3,
  "adress": "Rua das Flores, nº 45",
  "password": "a",
  "post_images": [
    {
      "image_url": "https://opulent-enigma-jj96g547jjvpfpqwx-3000.app.github.dev/imgs/logo-75x75.png"
    }
  ]
}
```

> 🔐 **Observação:** O campo **`password`** é necessário para posterior
> edição ou exclusão do post.\
> 🖼️ **post_images:** No envio real via *multipart/form-data*, a imagem
> deve ser enviada como arquivo (`images: @file(...)`).

------------------------------------------------------------------------

## 🟠 **Endpoint de Atualização (PUT)**

  -------------------------------------------------------------------------------
  Método   Endpoint                 Descrição
  -------- ------------------------ ---------------------------------------------
  PUT      `/lost_dog_posts/{id}`   Atualiza dados de um post específico, usando
                                    o ID na URL.

  -------------------------------------------------------------------------------

### 📦 Corpo da Requisição (JSON ou multipart/form-data)

Envie apenas os campos que deseja atualizar.

#### Exemplo de JSON:

``` json
{
  "pet_name": "Nome Atualizado"
}
```

**Exemplo de uso:**\
`PUT /lost_dog_posts/10`

------------------------------------------------------------------------

## 🔴 **Endpoint de Exclusão (DELETE)**

  --------------------------------------------------------------------------
  Método   Endpoint                 Descrição
  -------- ------------------------ ----------------------------------------
  DELETE   `/lost_dog_posts/{id}`   Exclui um post específico pelo ID.

  --------------------------------------------------------------------------
