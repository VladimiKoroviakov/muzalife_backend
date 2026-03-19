# Getting Started

## Requirements

| Dependency | Minimum Version |
|-----------|----------------|
| Node.js   | 20.x           |
| PostgreSQL | 14+           |
| npm       | 10+            |

## Installation

```bash
git clone https://github.com/your-org/muzalife-backend.git
cd muzalife-backend
npm install
```

## Environment Variables

Create a `.env` file in the project root:

```dotenv
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=muzalife
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=7d

# Email (Nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password
```

## Running

```bash
npm run setup-db   # initialise database schema
npm run dev        # development server with hot-reload
npm start          # production
```

## Documentation

```bash
npm run docs          # generate JSDoc HTML → docs/jsdoc/
npm run test:docs     # run living-documentation tests
npm run docs:archive  # create docs/jsdoc.zip
```

Once the server is running, open **https://localhost:5001/api/docs** for the live Swagger UI.
