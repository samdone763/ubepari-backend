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
    const lastMsg = messages?.[messages.length - 1]?.content?.toLowerCase() || '';

    // Simple AI responses about Ubepari PC
    let reply = '';
    if (lastMsg.includes('price') || lastMsg.includes('bei') || lastMsg.includes('cost')) {
      reply = 'Our prices vary by product and brand. Please check the Products tab for current prices, or contact us directly on 0619066079 for a quote! 💰';
    } else if (lastMsg.includes('delivery') || lastMsg.includes('deliver') || lastMsg.includes('uwasilishaji')) {
      reply = 'We offer FREE delivery to all 26 Tanzania regions! 🚚 Payment is collected after you receive your product.';
    } else if (lastMsg.includes('dell')) {
      reply = 'We stock a range of Dell laptops and desktops! Check the Products tab → Dell brand for current stock. 🔵';
    } else if (lastMsg.includes('hp')) {
      reply = 'HP products are available! Browse the Products tab → HP section for current listings. 🔷';
    } else if (lastMsg.includes('lenovo')) {
      reply = 'Lenovo laptops and ThinkPads are in stock! Check Products → Lenovo. 🔴';
    } else if (lastMsg.includes('apple') || lastMsg.includes('mac') || lastMsg.includes('macbook')) {
      reply = 'We carry Apple/Mac products! Check Products → Apple/Mac for availability. 🍎';
    } else if (lastMsg.includes('payment') || lastMsg.includes('lipa') || lastMsg.includes('malipo')) {
      reply = 'Great news! You pay AFTER delivery. We accept Cash, Credit/Debit Cards, Mobile Money (M-Pesa, Airtel, Tigo, Halopesa) and Cheques. No upfront payment needed! ✅';
    } else if (lastMsg.includes('warranty') || lastMsg.includes('dhamana')) {
      reply = 'All our products come with manufacturer warranty. We also offer assembly and setup services! 🔧';
    } else if (lastMsg.includes('location') || lastMsg.includes('address') || lastMsg.includes('mahali') || lastMsg.includes('wapi')) {
      reply = 'We are located at Magomeni Mapipa, Dar es Salaam. But we deliver to ALL Tanzania regions for FREE! 📍';
    } else if (lastMsg.includes('hello') || lastMsg.includes('hi') || lastMsg.includes('habari') || lastMsg.includes('hujambo')) {
      reply = 'Hello! 👋 Welcome to Ubepari PC! How can I help you today? Ask me about our products, prices, delivery or payment!';
    } else if (lastMsg.includes('stock') || lastMsg.includes('available') || lastMsg.includes('ipo')) {
      reply = 'Check our Products tab to see current stock availability for all brands. Items show "In Stock", "Low Stock" or "Out of Stock" status. 📦';
    } else if (lastMsg.includes('assembly') || lastMsg.includes('setup') || lastMsg.includes('usanidi')) {
      reply = 'Yes! We offer professional PC assembly and setup services. Contact us on 0619066079 for details. 🔧';
    } else if (lastMsg.includes('recycle') || lastMsg.includes('old') || lastMsg.includes('zamani')) {
      reply = 'We accept electronics recycling! Bring your old devices to our store at Magomeni Mapipa, Dar es Salaam. ♻️';
    } else {
      reply = 'Thanks for your message! For the best assistance, please call us on 📞 0619066079 or WhatsApp us. We\'re open daily 9am–10pm! 😊';
    }

    res.json({ reply });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

app.listen(PORT, () => console.log(`🚀 Ubepari PC Backend running on port ${PORT}`));
