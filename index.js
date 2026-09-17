const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());

// لحفظ الأجهزة المتصلة (الهواتف)
const connectedDevices = new Map();

// عند اتصال الموبايل بالخادم
io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);

    // الموبايل يرسل الكود الفريد الخاص به لتسجيل نفسه
    socket.on('register_device', (device_code) => {
        connectedDevices.set(device_code, socket.id);
        console.log(`Device registered: ${device_code} with socket ID: ${socket.id}`);
    });

    // عند انقطاع الاتصال
    socket.on('disconnect', () => {
        for (let [device_code, socket_id] of connectedDevices.entries()) {
            if (socket_id === socket.id) {
                connectedDevices.delete(device_code);
                console.log(`Device disconnected: ${device_code}`);
                break;
            }
        }
    });
});

// واجهة الـ API التي ستستقبل الطلب من موقعك أو من n8n
app.post('/api/send-sms', (req, res) => {
    const { device_code, phone_number, message } = req.body;

    if (!device_code || !phone_number || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const targetSocketId = connectedDevices.get(device_code);

    if (targetSocketId) {
        // إرسال أمر الإرسال للموبايل المحدد
        io.to(targetSocketId).emit('send_sms_command', { phone_number, message });
        res.status(200).json({ success: true, message: 'Command sent to device successfully' });
    } else {
        res.status(404).json({ error: 'Device not connected' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Broker running on port ${PORT}`);
});
