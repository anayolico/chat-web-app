# Chat Web App Backend

Production-ready Node.js backend for a real-time chat application with JWT authentication, MongoDB, and Mongoose.

## Folder Structure

```text
chat-web-app/
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── src/
    ├── app.js
    ├── server.js
    ├── config/
    │   └── db.js
    ├── controllers/
    │   └── authController.js
    ├── middleware/
    │   ├── authMiddleware.js
    │   ├── errorHandler.js
    │   ├── notFound.js
    │   └── validateRequest.js
    ├── models/
    │   └── User.js
    ├── routes/
    │   ├── authRoutes.js
    │   └── index.js
    ├── utils/
    │   ├── ApiError.js
    │   ├── asyncHandler.js
    │   └── generateToken.js
    └── validators/
        └── authValidators.js
```

## Full Code

### `package.json`

```json
{
  "name": "chat-web-app-backend",
  "version": "1.0.0",
  "description": "Production-ready backend for a real-time chat web app",
  "main": "src/server.js",
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js"
  },
  "keywords": [
    "chat",
    "express",
    "mongodb",
    "jwt",
    "mongoose"
  ],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.2",
    "express-rate-limit": "^7.5.0",
    "express-validator": "^7.2.1",
    "helmet": "^8.0.0",
    "http-status-codes": "^2.3.0",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.9.5",
    "morgan": "^1.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.7"
  }
}
```

### `.env.example`

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/chat-web-app
JWT_SECRET=change-this-to-a-long-random-secret
JWT_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=12
CLIENT_URL=http://localhost:3000
```

### `src/server.js`

```js
require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
```

### `src/app.js`

```js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*'
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use('/api', limiter, routes);

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy'
  });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
```

### `src/config/db.js`

```js
const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  await mongoose.connect(mongoUri);
  console.log('MongoDB connected successfully');
};

module.exports = connectDB;
```

### `src/models/User.js`

```js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters']
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false
    },
    profilePic: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false
    },
    versionKey: false
  }
);

userSchema.index({ phone: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
```

### `src/utils/ApiError.js`

```js
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

module.exports = ApiError;
```

### `src/utils/asyncHandler.js`

```js
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

module.exports = asyncHandler;
```

### `src/utils/generateToken.js`

```js
const jwt = require('jsonwebtoken');

const generateToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });

module.exports = generateToken;
```

### `src/middleware/validateRequest.js`

```js
const { validationResult } = require('express-validator');
const { StatusCodes } = require('http-status-codes');

const validateRequest = (req, _res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  return next({
    statusCode: StatusCodes.BAD_REQUEST,
    message: 'Validation failed',
    errors: errors.array().map((error) => ({
      field: error.path,
      message: error.msg
    }))
  });
};

module.exports = validateRequest;
```

### `src/middleware/authMiddleware.js`

```js
const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');

const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const protect = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Authorization token is required');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'User no longer exists');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid or expired token');
    }

    throw error;
  }
});

module.exports = {
  protect
};
```

### `src/middleware/notFound.js`

```js
const { StatusCodes } = require('http-status-codes');

const notFound = (req, res) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`
  });
};

module.exports = notFound;
```

### `src/middleware/errorHandler.js`

```js
const { StatusCodes, getReasonPhrase } = require('http-status-codes');

const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  let message = err.message || getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR);
  let errors;

  if (err.code === 11000) {
    statusCode = StatusCodes.CONFLICT;
    message = 'Phone number already exists';
  }

  if (err.name === 'ValidationError') {
    statusCode = StatusCodes.BAD_REQUEST;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((error) => ({
      field: error.path,
      message: error.message
    }));
  }

  if (err.errors && Array.isArray(err.errors)) {
    errors = err.errors;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors ? { errors } : {})
  });
};

module.exports = errorHandler;
```

### `src/validators/authValidators.js`

```js
const { body } = require('express-validator');

const phoneRegex = /^\+?[1-9]\d{7,14}$/;

const registerValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(phoneRegex)
    .withMessage('Phone number must be a valid international format'),
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6 and 128 characters'),
  body('profilePic')
    .optional()
    .trim()
    .isURL()
    .withMessage('Profile picture must be a valid URL')
];

const loginValidator = [
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(phoneRegex)
    .withMessage('Phone number must be a valid international format'),
  body('password')
    .trim()
    .notEmpty()
    .withMessage('Password is required')
];

module.exports = {
  registerValidator,
  loginValidator
};
```

### `src/controllers/authController.js`

```js
const bcrypt = require('bcryptjs');
const { StatusCodes } = require('http-status-codes');

const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const generateToken = require('../utils/generateToken');

const buildAuthResponse = (user) => ({
  id: user._id,
  name: user.name,
  phone: user.phone,
  profilePic: user.profilePic,
  createdAt: user.createdAt
});

const register = asyncHandler(async (req, res) => {
  const { name, phone, password, profilePic } = req.body;

  const existingUser = await User.findOne({ phone });
  if (existingUser) {
    throw new ApiError(StatusCodes.CONFLICT, 'Phone number already exists');
  }

  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const user = await User.create({
    name,
    phone,
    password: hashedPassword,
    profilePic
  });

  const token = generateToken({ userId: user._id });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'User registered successfully',
    data: {
      token,
      user: buildAuthResponse(user)
    }
  });
});

const login = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;

  const user = await User.findOne({ phone }).select('+password');
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid phone number or password');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid phone number or password');
  }

  const token = generateToken({ userId: user._id });

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Login successful',
    data: {
      token,
      user: buildAuthResponse(user)
    }
  });
});

const getCurrentUser = asyncHandler(async (req, res) => {
  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      user: buildAuthResponse(req.user)
    }
  });
});

module.exports = {
  register,
  login,
  getCurrentUser
};
```

### `src/routes/authRoutes.js`

```js
const express = require('express');

const { register, login, getCurrentUser } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { registerValidator, loginValidator } = require('../validators/authValidators');

const router = express.Router();

router.post('/register', registerValidator, validateRequest, register);
router.post('/login', loginValidator, validateRequest, login);
router.get('/me', protect, getCurrentUser);

module.exports = router;
```

### `src/routes/index.js`

```js
const express = require('express');

const authRoutes = require('./authRoutes');

const router = express.Router();

router.use('/auth', authRoutes);

module.exports = router;
```

## How to Run the Server

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Update `.env` with your MongoDB URI and JWT secret.

4. Start development server:

   ```bash
   npm run dev
   ```

5. Start production server:

   ```bash
   npm start
   ```

## API Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /health`

## Example Request Bodies

### Register

```json
{
  "name": "John Doe",
  "phone": "+2348012345678",
  "password": "strongpassword",
  "profilePic": "https://example.com/avatar.jpg"
}
```

### Login

```json
{
  "phone": "+2348012345678",
  "password": "strongpassword"
}
```
