import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3002),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:4200'),
  DATABASE_URL: Joi.string().required(),
  RABBITMQ_URL: Joi.string().uri({ scheme: ['amqp', 'amqps'] }).required(),
  RABBITMQ_EXCHANGE: Joi.string().min(1).default('people.relationships'),
  OUTBOX_PUBLISHER_RETRY_LIMIT: Joi.number().integer().min(1).default(5),
  OUTBOX_STALE_LOCK_MINUTES: Joi.number().integer().min(1).default(10),
  OUTBOX_PUBLISHER_INTERVAL_MS: Joi.number().integer().min(100).default(1000),
});
