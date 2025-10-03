import winston from 'winston';

// Forzamos la aparición de colores en la consola
winston.format.colorize().addColors({
  info: 'blue',
  warn: 'yellow',
  error: 'red'
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'trading-bot.log' }),
  ],
});

// Añadimos la consola con un formato simple y con colores
logger.add(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
  )
}));

// Exportamos el logger para poder usarlo en otros ficheros
export { logger };