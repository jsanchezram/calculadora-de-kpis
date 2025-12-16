import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { login, getMe } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { TrendingUp, Lock, Mail } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(email, password);
      const token = res.data.access_token;
      localStorage.setItem('token', token);
      const userRes = await getMe();
      loginUser(token, userRes.data);
      toast.success('Bienvenido de nuevo');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al iniciar sesion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] p-4">
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1687894986595-da703eb96375?crop=entropy&cs=srgb&fm=jpg&q=85')] bg-cover bg-center opacity-10" />
      
      <Card className="w-full max-w-md relative z-10 bg-[#121214] border-white/10 card-glow">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-2">
            <TrendingUp className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">BizMetrics</CardTitle>
          <CardDescription className="text-muted-foreground">
            Ingresa a tu cuenta para continuar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-muted-foreground">
                Correo electronico
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-zinc-900/50 border-white/10 focus:border-primary/50"
                  data-testid="login-email-input"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-muted-foreground">
                Contrasena
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-zinc-900/50 border-white/10 focus:border-primary/50"
                  data-testid="login-password-input"
                  required
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground glow-green"
              disabled={loading}
              data-testid="login-submit-btn"
            >
              {loading ? 'Cargando...' : 'Iniciar Sesion'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No tienes cuenta?{' '}
            <Link to="/register" className="text-primary hover:underline" data-testid="register-link">
              Registrate
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
