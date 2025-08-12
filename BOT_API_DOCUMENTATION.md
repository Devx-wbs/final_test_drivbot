# Bot Management API Documentation

## Overview
This API provides comprehensive bot management capabilities for trading bots connected to Binance through 3Commas. Users can create, manage, monitor, and control their trading bots with full integration to the 3Commas platform.

## Base URL
```
https://your-domain.com/api/bots
```

## Authentication
All requests require a `userId` parameter to identify the user and validate bot ownership.

## API Endpoints

### 1. Create Bot
**POST** `/create`

Creates a new trading bot with full 3Commas integration.

**Request Body:**
```json
{
  "userId": "mem_sb_cmdyghyya012n0wor3zw199hx",
  "botName": "BTC Long Bot",
  "direction": "long",
  "botType": "single",
  "pair": "BTC_USDT",
  "profitCurrency": "quote",
  "baseOrderSize": 100,
  "startOrderType": "market",
  "takeProfitType": "total",
  "targetProfitPercent": 2.5,
  "safetyOrderVolume": 100,
  "maxSafetyOrders": 5,
  "safetyOrderStepPercentage": 2.0,
  "stopLossPercentage": 0,
  "cooldown": 0,
  "note": "My first trading bot"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bot created successfully in 3Commas",
  "botId": "64f8a1b2c3d4e5f6a7b8c9d0",
  "threeCommasBotId": 12345,
  "bot": { /* bot object */ },
  "threeCommasData": { /* 3Commas response */ }
}
```

### 2. Get Bot Statistics
**GET** `/stats/:botId?` (optional botId)

Gets comprehensive statistics for a specific bot or all user bots.

**Query Parameters:**
- `userId` (required): User identifier
- `botId` (optional): Specific bot ID

**Response (Single Bot):**
```json
{
  "success": true,
  "message": "Bot statistics retrieved successfully",
  "bot": { /* bot object */ },
  "threeCommasData": { /* 3Commas data */ },
  "performance": {
    "totalDeals": 15,
    "activeDeals": 2,
    "totalProfit": 45.67,
    "totalProfitPercent": 2.3,
    "averageProfit": 3.04,
    "winRate": 80.0,
    "lastDealAt": "2025-01-15T10:30:00Z"
  }
}
```

**Response (All Bots):**
```json
{
  "success": true,
  "message": "Bot statistics retrieved successfully",
  "totalBots": 5,
  "bots": [ /* array of bots */ ],
  "threeCommasBots": [ /* 3Commas data */ ],
  "summary": {
    "totalBots": 5,
    "activeBots": 3,
    "totalProfit": 156.78,
    "totalDeals": 45,
    "averageProfit": 31.36
  }
}
```

### 3. Update Bot Configuration
**PATCH** `/update/:botId`

Updates an existing bot's configuration in both local database and 3Commas.

**Request Body:**
```json
{
  "userId": "mem_sb_cmdyghyya012n0wor3zw199hx",
  "targetProfitPercent": 3.0,
  "maxSafetyOrders": 7,
  "safetyOrderStepPercentage": 2.5,
  "note": "Updated configuration"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bot updated successfully",
  "bot": { /* updated bot object */ }
}
```

### 4. Get Bot Performance
**GET** `/performance/:botId`

Gets detailed performance metrics for a specific bot including deal history.

**Query Parameters:**
- `userId` (required): User identifier

**Response:**
```json
{
  "success": true,
  "message": "Bot performance retrieved successfully",
  "bot": { /* bot object */ },
  "deals": [ /* array of deals */ ],
  "performance": {
    "totalDeals": 15,
    "completedDeals": 12,
    "activeDeals": 3,
    "totalProfit": 45.67,
    "totalProfitPercent": 2.3,
    "averageProfit": 3.04,
    "winRate": 80.0,
    "bestDeal": 12.50,
    "worstDeal": -2.30,
    "averageDealDuration": 86400000
  }
}
```

### 5. Get Bot Deals
**GET** `/deals/:botId`

Retrieves all deals for a specific bot with pagination support.

**Query Parameters:**
- `userId` (required): User identifier
- `limit` (optional): Number of deals to return (default: 50)
- `offset` (optional): Number of deals to skip (default: 0)

**Response:**
```json
{
  "success": true,
  "message": "Bot deals retrieved successfully",
  "bot": { /* bot object */ },
  "deals": [ /* array of deals */ ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 15
  }
}
```

### 6. Duplicate Bot
**POST** `/duplicate/:botId`

Creates a copy of an existing bot with a new name.

**Request Body:**
```json
{
  "userId": "mem_sb_cmdyghyya012n0wor3zw199hx",
  "newName": "BTC Long Bot Copy"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bot duplicated successfully",
  "originalBot": "64f8a1b2c3d4e5f6a7b8c9d0",
  "newBot": "64f8a1b2c3d4e5f6a7b8c9d1",
  "threeCommasBotId": 12346,
  "bot": { /* new bot object */ }
}
```

### 7. Get Bot Details
**GET** `/details/:botId`

Gets comprehensive details for a specific bot including 3Commas data.

**Query Parameters:**
- `userId` (required): User identifier

**Response:**
```json
{
  "message": "Bot details fetched successfully",
  "bot": { /* bot object */ },
  "threeCommasData": { /* 3Commas data */ },
  "hasThreeCommasData": true
}
```

### 8. Get Bot Summary
**GET** `/summary`

Gets a summary overview of all user bots for dashboard display.

**Query Parameters:**
- `userId` (required): User identifier

**Response:**
```json
{
  "message": "Bot summary fetched successfully",
  "summary": {
    "totalBots": 5,
    "runningBots": 3,
    "pausedBots": 1,
    "stoppedBots": 1,
    "errorBots": 0,
    "totalValue": 2500,
    "totalProfit": 156.78,
    "averageProfit": 31.36
  },
  "topBots": [ /* top 5 performing bots */ ],
  "recentBots": [ /* 10 most recently updated bots */ ]
}
```

### 9. Bot Control Operations

#### Start Bot
**POST** `/start/:botId`
```json
{
  "userId": "mem_sb_cmdyghyya012n0wor3zw199hx"
}
```

#### Pause Bot
**POST** `/pause/:botId`
```json
{
  "userId": "mem_sb_cmdyghyya012n0wor3zw199hx"
}
```

#### Emergency Stop Bot
**POST** `/emergency-stop/:botId`
```json
{
  "userId": "mem_sb_cmdyghyya012n0wor3zw199hx"
}
```

#### Delete Bot
**DELETE** `/delete/:botId`
```json
{
  "userId": "mem_sb_cmdyghyya012n0wor3zw199hx"
}
```

### 10. 3Commas Integration

#### List 3Commas Bots
**GET** `/list-3commas?userId=mem_sb_cmdyghyya012n0wor3zw199hx`

#### Verify Bot Creation
**GET** `/verify/:botId?userId=mem_sb_cmdyghyya012n0wor3zw199hx`

## Bot Configuration Options

### Required Fields
- `botName`: Unique name for the bot
- `direction`: "long" or "short"
- `botType`: "single" or "multi"
- `pair`: Trading pair (e.g., "BTC_USDT", "ETH_USDT")
- `profitCurrency`: "quote" or "base"
- `baseOrderSize`: Initial order size in quote currency
- `startOrderType`: "market" or "limit"
- `takeProfitType`: "total" or "step"
- `targetProfitPercent`: Target profit percentage (0-100)

### Optional Fields
- `safetyOrderVolume`: Safety order size (defaults to baseOrderSize)
- `maxSafetyOrders`: Maximum number of safety orders (1-25, default: 5)
- `safetyOrderStepPercentage`: Step between safety orders (0.1-50, default: 2.0)
- `stopLossPercentage`: Stop loss percentage (0-100, default: 0)
- `cooldown`: Cooldown period in seconds (default: 0)
- `note`: Additional notes about the bot

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error information"
}
```

Common HTTP Status Codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors)
- `403`: Forbidden (unauthorized access)
- `404`: Not Found
- `500`: Internal Server Error

## Rate Limiting

The API implements reasonable rate limiting to prevent abuse. Please implement appropriate delays between requests in your applications.

## Best Practices

1. **Always validate user input** before sending to the API
2. **Implement proper error handling** for all API calls
3. **Use pagination** when retrieving large datasets
4. **Monitor bot performance** regularly using the statistics endpoints
5. **Implement proper logging** for debugging and monitoring
6. **Use the emergency stop** feature for risk management
7. **Regularly backup bot configurations** using the details endpoints

## Example Usage

### Creating a Simple Long Bot
```javascript
const response = await fetch('/api/bots/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'mem_sb_cmdyghyya012n0wor3zw199hx',
    botName: 'Simple BTC Long',
    direction: 'long',
    botType: 'single',
    pair: 'BTC_USDT',
    profitCurrency: 'quote',
    baseOrderSize: 100,
    startOrderType: 'market',
    takeProfitType: 'total',
    targetProfitPercent: 2.0
  })
});

const result = await response.json();
console.log('Bot created:', result.botId);
```

### Monitoring Bot Performance
```javascript
const response = await fetch(`/api/bots/performance/${botId}?userId=${userId}`);
const performance = await response.json();
console.log('Win rate:', performance.performance.winRate + '%');
console.log('Total profit:', performance.performance.totalProfit);
```

This comprehensive API provides everything you need to create, manage, and monitor trading bots with full 3Commas integration!
