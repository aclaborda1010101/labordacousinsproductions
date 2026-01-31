import { useState } from 'react';
import { useAuthBypass } from '@/hooks/useAuthBypass';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const SimpleAuth = () => {
  const [email, setEmail] = useState('agustin@hustleovertalks.com');
  const [password, setPassword] = useState('Bosco2305!');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUpBypass, signInBypass, user } = useAuthBypass();

  const handleAuth = async () => {
    setLoading(true);
    try {
      const result = isSignUp 
        ? await signUpBypass(email, password)
        : await signInBypass(email, password);
      
      if (result.error) {
        console.error('Auth error:', result.error);
        // En modo dev, simplemente loggeamos y continuamos
        if (import.meta.env.VITE_DEV_MODE === 'true') {
          console.log('Dev mode: bypassing auth error');
        }
      } else {
        console.log('Auth success:', result.user);
      }
    } catch (error) {
      console.error('Auth failed:', error);
    }
    setLoading(false);
  };

  if (user) {
    return (
      <Card className="w-96">
        <CardHeader>
          <CardTitle>¡Autenticado!</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Email: {user.email}</p>
          <p>¡Ya puedes crear proyectos!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Acceso Rápido ManIAS Lab</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="space-y-2">
          <Button 
            onClick={handleAuth} 
            disabled={loading}
            className="w-full"
          >
            {loading ? 'Procesando...' : (isSignUp ? 'Crear Cuenta' : 'Entrar')}
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full"
          >
            {isSignUp ? '¿Ya tienes cuenta? Entrar' : '¿No tienes cuenta? Crear'}
          </Button>
        </div>
        <div className="text-xs text-gray-500">
          Modo desarrollo: Sin confirmación de email requerida
        </div>
      </CardContent>
    </Card>
  );
};
