const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// السماح بقراءة البيانات بصيغة JSON
app.use(express.json());

// كائن لتخزين الأجهزة المتصلة (Device ID -> Socket ID)
const connectedDevices = {};

// 1. واجهة الـ API (لاستقبال أوامر الإرسال من n8n أو FileMaker وتوجيهها للموبايل)
app.post('/api/send-sms', (req, res) => {
    const { device_code, phone_number, message } = req.body;

    if (!device_code || !phone_number || !message) {
        return res.status(400).json({ error: 'Missing parameters (device_code, phone_number, message)' });
    }

    const socketId = connectedDevices[device_code];

    if (socketId) {
        // إرسال الأمر للموبايل عبر الـ Socket
        io.to(socketId).emit('send_sms_command', { phone_number, message });
        return res.status(200).json({ success: true, message: 'Command sent to device successfully' });
    } else {
        return res.status(404).json({ error: 'Device not connected' });
    }
});

// 2. إدارة اتصالات الموبايل (WebSockets)
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // تسجيل الجهاز عند فتحه للتطبيق
    socket.on('register_device', (deviceId) => {
        connectedDevices[deviceId] = socket.id;
        console.log(`Device registered: ${deviceId} (Socket ID: ${socket.id})`);
    });

    // استلام الرسائل الواردة من الموبايل وتوجيهها إلى n8n
    socket.on('sms_received', async (data) => {
        console.log('New SMS received on device, forwarding to n8n:', data);
        
        // رابط n8n الخاص بك
        const n8nWebhookUrl = 'https://n8n.101488.xyz/webhook-test/smsgateway';
        
        try {
            const response = await fetch(n8nWebhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data) // إرسال (device_code, sender, message)
            });
            
            if (response.ok) {
                console.log('Successfully forwarded SMS to n8n');
            } else {
                console.error('Failed to forward to n8n. HTTP Status:', response.status);
            }
        } catch (error) {
            console.error('Error in fetching n8n Webhook:', error.message);
        }
    });

    // تنظيف السجل عند انقطاع الاتصال (إغلاق التطبيق أو فقدان الإنترنت)
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        for (const [deviceId, id] of Object.entries(connectedDevices)) {
            if (id === socket.id) {
                delete connectedDevices[deviceId];
                console.log(`Device removed from active list: ${deviceId}`);
                break;
            }
        }
    });
});

// تشغيل الخادم
const PORT = process.env.PORT || 80;
server.listen(PORT, () => {
    console.log(`Server is running and listening on port ${PORT}`);
});
