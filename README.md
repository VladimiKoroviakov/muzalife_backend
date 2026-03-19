![License](https://img.shields.io/badge/License-MIT-green)

# MuzaLife Back End

Backend API for the MuzaLife application — a modern web ecosystem supporting the frontend with scalable REST endpoints.

This repository contains the source code for the server-side of the MuzaLife project. It handles API routes, authentication, business logic, database interactions, and integrations used by the MuzaLife ecosystem.


## Features

- Express.js for fast and flexible REST API development
- Modular architecture for scalable services and routes
- Environment-based configuration for easy deployment
- JWT Authentication & OAuth (Google, Facebook)
- Database integration (PostgreSQL)
- Structured logging and error handling


## Getting Started

Follow these steps to run the backend locally.

### Prerequisites
- Node.js v16+
- npm or yarn
- Database setup (PostgreSQL)

### Clone & Install

```
git clone https://github.com/VladimiKoroviakov/muzalife_backend.git
cd muzalife_backend
npm install
```


## Project Structure

```
/
├── config/        # App configuration (DB setup + Multer if you want to serve files)
├── controllers/   # Request handlers for routes
├── middlewares/   # Express middlewares (auth, validation, logging, file uploads)
├── routes/        # API route definitions
├── scripts/       # Scripts for the intial databse setup (Adding all the tables & indexes)
├── services/      # Business logic and external integrations (email, verification)
├── utils/         # Utility functions (formatters, validators, JWT)
├── server.js      # Server entry point (main file)
```


## Configuration

Environment Variables

Create a `.env` file in the project root:

```
PORT=your_localhost_port_here
DB_HOST=localhost
DB_PORT=your_db_port_here
DB_NAME=muzalife
DB_USER=your_db_user_here
DB_PASSWORD=your_db_password_here
JWT_SECRET=your_jwt_secret_here
FRONTEND_URL=your_front_end_url_here
BACKEND_URL=your_back_end_url_here

SMTP_HOST=smtp.gmail.com
SMTP_PORT=your_mail_service_port_here
SMTP_SECURE=false
SMTP_USER=your_mail_service_user_email_here
SMTP_PASSWORD=your_mail_service_app_pawssword_here
EMAIL_FROM="Muza Life" <noreply@muzalife.com>

FACEBOOK_APP_ID=your_facebook_app_id_here
FACEBOOK_APP_SECRET=your__facebook_app_secret_here
```

## Running the code

Run `npm i` to install the dependencies (if you haven't done that already).

Run `npm run dev` to start the development server.

Run
```
npm run build
npm start
``` 
to start in production mode

## Documentation

### Documentation standard

All public modules, controllers, services, middleware, and utility functions use **JSDoc 3** comments. Every contributor must follow the same standard to keep the generated reference up-to-date.

**Minimum required tags for every exported symbol:**

| Tag | Purpose |
|---|---|
| `@fileoverview` / `@module` | File-level description and module name |
| `@param {Type} name` | Each function parameter |
| `@returns {Type}` | Return value |
| `@throws {Type}` | Exceptions the function may throw |
| `@example` | At least one usage example |

**Document in the description body (not just tags):**
- Why the function/class exists (architectural or business reason)
- Non-obvious algorithms (e.g. the two-step registration flow)
- Edge cases and their handling

### Generating HTML docs

```bash
# Install dependencies (only needed once)
npm install

# Generate JSDoc HTML → docs/jsdoc/
npm run docs

# Clean output and regenerate
npm run docs:clean
```

Open `docs/jsdoc/index.html` in a browser to browse the reference.

### API documentation (Swagger UI)

The full OpenAPI 3.0 specification lives in `docs/api/openapi.yaml`.

When the server is running, browse the **interactive Swagger UI** at:
```
https://localhost:5001/api/docs
```

### Linting docs quality

```bash
npm run lint
```

JSDoc-related warnings (`jsdoc/require-jsdoc`, `jsdoc/require-param`, etc.) indicate missing documentation. Fix all warnings before opening a Pull Request.

### Detailed guide

See [`docs/generate_docs.md`](./docs/generate_docs.md) for the full documentation guide.

---

## Contributing

Contributions are welcome! Follow these steps:
1.	Fork it
2.	Create your feature branch (git checkout -b feature/your-feature)
3.	Commit your changes
4.	Push to your branch
5.	Open a Pull Request

Please make sure your code follows existing style conventions and includes relevant tests when applicable.


## Contact

If you want to reach out:
- GitHub: https://github.com/VladimiKoroviakov
- Email: v.korovyakov@student.sumdu.edu.ua


## License

This project is licensed under the MIT License - see the LICENSE file for details.


## Support

If you found this project useful, give it a ⭐ on GitHub!
