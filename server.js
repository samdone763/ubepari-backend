const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ubepari';
const JWT_SECRET = process.env.JWT_SECRET || 'ubepari_secret_2024';
const ADMIN_USER = process.env.ADMIN_USER || 'ubepari_pc';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Ubepari@2024!';
const PORT = process.env.PORT || 3000;

// ===== CONNECT DB =====
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB connected')).catch(e => console.error('❌ DB error:', e));

// ===== SCHEMAS =====
const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  caption: String,
  brand: { type: String, required: true, lowercase: true },
  price: { type: Number, default: 0 },
  costPrice: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  imageUrl: String,
  createdAt: { type: Date, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  product: {
    id: String, name: String, brand: String,
    price: Number, qty: { type: Number, default: 1 }
  },
  customer: {
    name: String, phone: String,
    region: String, address: String, date: String
  },
  notes: String,
  paymentMethod: { type: String, default: 'After Delivery' },
  status: { type: String, enum: ['pending','confirmed','delivered','cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const GallerySchema = new mongoose.Schema({
  url: String,
  caption: String,
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);
const Gallery = mongoose.model('Gallery', GallerySchema);

// ===== MIDDLEWARE =====
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    req.admin = decoded;
    next();
  } catch(e) { res.status(401).json({ message: 'Invalid token' }); }
}

// ===== ROUTES =====

// Health
app.get('/api/health', (req, res) => res.json({ success: true, status: 'healthy', uptime: process.uptime(), environment: 'Production' }));

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, message: 'Login successful' });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// ===== PRODUCTS =====
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/products', authMiddleware, async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.json({ success: true, product });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Restock — add quantity and update cost price
app.patch('/api/products/:id/restock', authMiddleware, async (req, res) => {
  try {
    const { addQty, costPrice } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    product.stock = (product.stock || 0) + (addQty || 0);
    if (costPrice) product.costPrice = costPrice;
    await product.save();
    res.json({ success: true, product });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== ORDERS =====
// Public order tracking by orderId
app.get('/api/orders/track/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/orders', async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();

    // Decrease stock when order is placed
    if (req.body.product?.id) {
      await Product.findByIdAndUpdate(req.body.product.id, {
        $inc: { stock: -(req.body.product.qty || 1) }
      });
    }

    res.json({ success: true, order });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/orders/:id/status', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.json({ success: true, order });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== GALLERY =====
app.get('/api/gallery', async (req, res) => {
  try {
    const photos = await Gallery.find().sort({ createdAt: -1 });
    res.json(photos);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/gallery', authMiddleware, async (req, res) => {
  try {
    const photo = new Gallery(req.body);
    await photo.save();
    res.json({ success: true, photo });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/gallery/:id', authMiddleware, async (req, res) => {
  try {
    await Gallery.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ===== CHAT =====
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    // Get all products from DB
    const inStock = await Product.find({ stock: { $gt: 0 } });
    const outOfStock = await Product.find({ stock: { $lte: 0 } });

    const inStockList = inStock.length
      ? inStock.map(p => `- ${p.name} | Brand: ${p.brand?.toUpperCase()} | Price: TZS ${Number(p.price).toLocaleString()} | Stock: ${p.stock} units${p.caption ? ' | '+p.caption : ''}`).join('\n')
      : 'No products currently in stock.';

    const outOfStockList = outOfStock.length
      ? outOfStock.map(p => `- ${p.name} | Brand: ${p.brand?.toUpperCase()}${p.price ? ' | Price: TZS '+Number(p.price).toLocaleString() : ''}`).join('\n')
      : 'None';

    const systemPrompt = `You are a friendly and knowledgeable AI assistant for Ubepari PC, a computer store in Dar es Salaam, Tanzania.

STORE INFO:
- Name: Ubepari PC
- Location: Magomeni Mapipa, Dar es Salaam, Tanzania
- Phone: 0619066079
- Hours: 9AM - 10PM daily (Mon-Sun)
- Delivery: FREE to all 26 Tanzania regions
- Payment: After delivery (Cash, Cards, Mobile Money, Cheques)
- Services: PC Assembly, Electronics Recycling, Free WiFi at store

PRODUCTS CURRENTLY IN STOCK:
${inStockList}

PRODUCTS OUT OF STOCK:
${outOfStockList}

YOUR JOB:
- Answer questions about our products, prices, specs, delivery, and payment
- If asked about a product we don't have, say we don't have it currently but suggest alternatives from our stock
- You can explain PC specs, brands (Dell, HP, Lenovo, Apple/Mac), and help customers choose
- Always be helpful, friendly and professional
- Respond in the same language the customer uses (English or Swahili)
- Keep responses concise and clear (max 150 words)
- Never make up products or prices - only use what is listed above
- Always end with a helpful suggestion or call to action
- If unsure, direct customer to call 0619066079`;

    // Call Groq API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-6)
        ]
      })
    });

    const data = await response.json();
    console.log('Groq response status:', response.status);
    if (!response.ok) console.error('Groq error:', JSON.stringify(data));
    const reply = data.choices?.[0]?.message?.content || 'Sorry, please call 0619066079 for assistance! 📞';
    res.json({ reply });

  } catch(e) {
    console.error('Chat error:', e);
    res.json({ reply: 'Sorry, something went wrong. Please call us on 0619066079 or WhatsApp! 📞' });
  }
});

app.listen(PORT, () => console.log(`🚀 Ubepari PC Backend running on port ${PORT}`));
