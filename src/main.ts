import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend (allow all origins in production if needed, or specify)
  app.enableCors({
    origin: [
      'http://localhost:5173', // Admin portal
      'http://localhost:5174', // Company portal
      'https://intern-admin-zeta.vercel.app', // Admin production
      'https://intern-company-eight.vercel.app', // Company production
      'http://192.168.0.103:8081', // Mobile app (Expo)
      'exp://192.168.0.103:8081', // Mobile app (Expo scheme)
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 3600,
  });

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0'); // Listen on all interfaces for Vercel
  console.log(`🚀 Backend running on port ${port}`);
}
bootstrap();
