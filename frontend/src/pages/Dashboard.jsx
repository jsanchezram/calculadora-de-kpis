import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCompanies, createCompany, deleteCompany } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { 
  Building2, Plus, TrendingUp, LogOut, BarChart3, Trash2, ArrowRight 
} from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      const res = await getCompanies();
      setCompanies(res.data);
    } catch (err) {
      toast.error('Error al cargar empresas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;
    setCreating(true);
    try {
      await createCompany(newCompanyName);
      toast.success('Empresa creada exitosamente');
      setNewCompanyName('');
      setDialogOpen(false);
      loadCompanies();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear empresa');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCompany = async (id, name) => {
    if (!window.confirm(`Estas seguro de eliminar "${name}"?`)) return;
    try {
      await deleteCompany(id);
      toast.success('Empresa eliminada');
      loadCompanies();
    } catch (err) {
      toast.error('Error al eliminar empresa');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Header */}
      <header className="glass sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">BizMetrics</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground hidden sm:block">
                {user?.email}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleLogout}
                data-testid="logout-btn"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Salir
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Mis Empresas</h2>
            <p className="text-muted-foreground mt-1">
              Gestiona los datos financieros de tus empresas
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 glow-green" data-testid="create-company-btn">
                <Plus className="w-4 h-4 mr-2" />
                Nueva Empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#121214] border-white/10">
              <DialogHeader>
                <DialogTitle>Crear Nueva Empresa</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateCompany} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nombre de la empresa</Label>
                  <Input
                    id="companyName"
                    placeholder="Mi Empresa S.A."
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    className="bg-zinc-900/50 border-white/10"
                    data-testid="company-name-input"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={creating}
                  data-testid="submit-company-btn"
                >
                  {creating ? 'Creando...' : 'Crear Empresa'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-[#121214] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : companies.length === 0 ? (
          <Card className="bg-[#121214] border-white/10 card-glow">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No tienes empresas</h3>
              <p className="text-muted-foreground text-center mb-4">
                Crea tu primera empresa para comenzar a registrar datos financieros
              </p>
              <Button 
                onClick={() => setDialogOpen(true)}
                className="bg-primary hover:bg-primary/90"
                data-testid="create-first-company-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                Crear Primera Empresa
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((company) => (
              <Card 
                key={company.id} 
                className="bg-[#121214] border-white/10 card-glow hover:border-white/20 transition-all group cursor-pointer"
                data-testid={`company-card-${company.id}`}
              >
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-lg">{company.name}</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCompany(company.id, company.name);
                    }}
                    data-testid={`delete-company-${company.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <BarChart3 className="w-4 h-4" />
                      <span className="text-sm">Ver Dashboard</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary"
                      onClick={() => navigate(`/company/${company.id}`)}
                      data-testid={`view-company-${company.id}`}
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
