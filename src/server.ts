import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { timeStamp } from 'console';
import { config } from './config/env';

dotenv.config();  // Load environment variables

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Route
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'SMS Gateway Backend is up and running!',
    timeStamp: new Date().toISOString(),
});
});

// Start Server
app.listen(config.port, () => {
  console.log(`[server]: Server is running at http://localhost:${config.port} ${config.nodeEnv}`);
});