import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { CartProvider } from './context/CartContext';
import { Cart } from './pages/Cart';
import { Contact } from './pages/Contact';
import { Customize } from './pages/Customize';
import { Admin } from './pages/Admin';
import { Home } from './pages/Home';
import { ProductDetail } from './pages/ProductDetail';
import { Profile } from './pages/Profile';
import { Services } from './pages/Services';
import { Shop } from './pages/Shop';

export default function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/services" element={<Services />} />
            <Route path="/boutique" element={<Shop />} />
            <Route path="/personnaliser" element={<Customize />} />
            <Route path="/produit/:slug" element={<ProductDetail />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/panier" element={<Cart />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/produits" element={<Admin />} />
            <Route path="/admin/options" element={<Admin />} />
            <Route path="/admin/utilisateurs" element={<Admin />} />
            <Route path="/admin/commandes" element={<Admin />} />
            <Route path="/admin/devis" element={<Admin />} />
            <Route path="/admin/services" element={<Admin />} />
            <Route path="/admin/livraison" element={<Admin />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </main>
        <Footer />
      </BrowserRouter>
    </CartProvider>
  );
}
