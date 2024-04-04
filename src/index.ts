import express from 'express';
import userRoutes from './routes/user.routes';
import eventRoutes from './routes/event.routes';
import lambdaRoutes from './routes/lambda.routes';
import dotenv from 'dotenv';
import cors from 'cors';
import bodyParser from 'body-parser';

dotenv.config();
// Enable CORS only for the origin specified in the CORS_ORIGIN environment variable
const corsOptions = {
  origin: process.env.CORS_ORIGIN,
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

const app = express();
app.use(express.json());
app.use(cors(corsOptions));
app.use(bodyParser.json());

app.use('/users', userRoutes);
app.use('/events', eventRoutes);
app.use('/lambda', lambdaRoutes);


app.listen(process.env.PORT, () =>
  console.log('Server is running on port', process.env.PORT)
);