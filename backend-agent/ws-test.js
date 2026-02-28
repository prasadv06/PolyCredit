const WebSocket = require('ws');
const ws = new WebSocket('wss://ws.predict.fun/ws');
ws.on('open', () => {
    ws.send(JSON.stringify({ method: 'subscribe', requestId: 1, params: ['predictOrderbook/7731'] }));
});
ws.on('message', data => {
    console.log(data.toString());
});
setTimeout(() => process.exit(), 5000);
