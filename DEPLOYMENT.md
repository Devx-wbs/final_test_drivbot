# Production Deployment Guide

## Prerequisites

- Node.js 16+ installed
- MongoDB database (local or cloud)
- 3Commas API credentials
- Binance API credentials

## Environment Setup

Create a `.env` file in the root directory:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/drivbots
# or for MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/drivbots

# 3Commas API Configuration
THREE_COMMAS_API_KEY=your_3commas_api_key_here
THREE_COMMAS_API_SECRET=your_3commas_api_secret_here

# Server Configuration
PORT=3000
NODE_ENV=production

# Optional: Default 3Commas Account ID
# THREE_COMMAS_ACCOUNT_ID=12345
```

## Installation

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start the server:**

   ```bash
   npm start
   ```

3. **For development:**
   ```bash
   npm run dev
   ```

## API Endpoints

### Bot Management

- `POST /api/bots/create` - Create new bot
- `GET /api/bots/verify/:botId` - Verify bot in 3Commas
- `GET /api/bots/list-3commas` - List all 3Commas bots
- `GET /api/bots/user/:userId` - Get user's bots
- `POST /api/bots/pause/:botId` - Pause bot
- `POST /api/bots/start/:botId` - Start bot
- `DELETE /api/bots/delete/:botId` - Delete bot

### Binance/3Commas Integration

- `POST /api/binance/connect` - Connect Binance account
- `GET /api/binance/check-accounts` - Check 3Commas accounts
- `GET /api/binance/test-3commas` - Test 3Commas connection
- `GET /api/binance/status` - Check connection status

### Health Check

- `GET /health` - Server health status

## Usage Flow

1. **Connect Binance Account:**

   ```bash
   POST /api/binance/connect
   {
     "userId": "user123",
     "apiKey": "your_binance_api_key",
     "apiSecret": "your_binance_api_secret"
   }
   ```

2. **Create Bot:**

   ```bash
   POST /api/bots/create
   {
     "userId": "user123",
     "botName": "My Trading Bot",
     "direction": "long",
     "botType": "single",
     "pair": "BTC_USDT",
     "profitCurrency": "quote",
     "baseOrderSize": 10,
     "startOrderType": "market",
     "takeProfitType": "total",
     "targetProfitPercent": 1.0
   }
   ```

3. **Verify Bot Creation:**
   ```bash
   GET /api/bots/verify/{botId}
   ```

## Production Considerations

### Security

- Use HTTPS in production
- Store API keys securely
- Implement rate limiting
- Add authentication middleware

### Monitoring

- Monitor server logs
- Set up health checks
- Monitor MongoDB connections
- Track API response times

### Scaling

- Use PM2 for process management
- Set up load balancing
- Use MongoDB Atlas for cloud database
- Implement caching where appropriate

## Troubleshooting

### Common Issues

1. **"No 3Commas account found"**

   - Ensure Binance account is connected first
   - Check that `threeCommasAccountId` is stored

2. **"Failed to create bot in 3Commas"**

   - Verify 3Commas API credentials
   - Check account balance
   - Use valid trading pairs (e.g., `BTC_USDT`)

3. **MongoDB connection issues**
   - Verify MongoDB URI
   - Check network connectivity
   - Ensure database exists

### Logs

Check server logs for detailed error messages:

```bash
tail -f logs/app.log
```

## Support

For issues, check:

1. Server logs for error details
2. 3Commas API documentation
3. MongoDB connection status
4. Environment variable configuration
