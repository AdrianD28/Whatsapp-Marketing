import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus, Coins, Edit2, Trash2, Shield, User, Crown, Ban, Check } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import toast from 'react-hot-toast';

interface User {
  _id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'user';
  credits: number;
  suspended?: boolean;
  createdAt: string;
  createdBy?: string;
}

export function Admin() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showAddCredits, setShowAddCredits] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');

  // Form states
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin'>('user');
  const [newUserCredits, setNewUserCredits] = useState(0);
  const [creditsToAdd, setCreditsToAdd] = useState(0);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Obtener rol del usuario actual
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          setCurrentUserRole(data.user?.role || 'user');
        }
      } catch (err) {
        console.error('Error loading current user:', err);
      }
    };
    loadCurrentUser();
  }, []);

  // Cargar lista de usuarios
  const loadUsers = async () => {
    setLoading(true);
    try {
      console.log('🔍 Cargando usuarios...');
      const res = await fetch('/api/admin/users', { headers: getAuthHeaders() });
      console.log('📡 Respuesta del servidor:', res.status, res.statusText);
      
      if (!res.ok) {
        if (res.status === 403) {
          toast.error('No tienes permisos de administrador');
        }
        throw new Error('Error al cargar usuarios');
      }
      const data = await res.json();
      console.log('📦 Datos recibidos:', data);
      console.log('👥 Usuarios en data.users:', data.users);
      console.log('📊 Cantidad de usuarios:', data.users?.length || 0);
      
      // Verificar estructura de cada usuario
      if (data.users && data.users.length > 0) {
        console.log('🔍 Primer usuario completo:', JSON.stringify(data.users[0]));
        console.log('🔑 Propiedades del primer usuario:', Object.keys(data.users[0]));
      }
      
      setUsers(data.users || []);
    } catch (err: any) {
      console.error('❌ Error loading users:', err);
      toast.error(err.message || 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Crear nuevo usuario
  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast.error('Email y contraseña son requeridos');
      return;
    }

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
          credits: newUserCredits,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Error al crear usuario');
      }

      toast.success('Usuario creado exitosamente');
      setShowCreateUser(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('user');
      setNewUserCredits(0);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Error al crear usuario');
    }
  };

  // Agregar créditos
  const handleAddCredits = async () => {
    if (!selectedUser || creditsToAdd <= 0) {
      toast.error('Ingresa una cantidad válida de créditos');
      return;
    }

    if (!selectedUser._id) {
      console.error('❌ selectedUser._id is missing:', selectedUser);
      toast.error('Error: Usuario no tiene ID válido');
      return;
    }

    console.log('💳 Agregando créditos:', {
      userId: selectedUser._id,
      amount: creditsToAdd,
      userEmail: selectedUser.email
    });

    try {
      const res = await fetch('/api/admin/credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          userId: selectedUser._id,
          amount: creditsToAdd,
        }),
      });

      const responseData = await res.json();
      console.log('📡 Respuesta del servidor:', responseData);

      if (!res.ok) {
        throw new Error(responseData.error || responseData.message || 'Error al agregar créditos');
      }

      toast.success(`${creditsToAdd} créditos agregados a ${selectedUser.email}`);
      setShowAddCredits(false);
      setCreditsToAdd(0);
      setSelectedUser(null);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Error al agregar créditos');
    }
  };

  // Cambiar rol
  const handleChangeRole = async (userId: string, newRole: 'user' | 'admin' | 'super_admin') => {
    if (currentUserRole !== 'super_admin' && newRole === 'super_admin') {
      toast.error('Solo el super admin puede asignar el rol de super admin');
      return;
    }

    if (!confirm(`¿Cambiar rol de este usuario a ${newRole}?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Error al cambiar rol');
      }

      toast.success('Rol actualizado');
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar rol');
    }
  };

  // Eliminar usuario
  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`¿Eliminar usuario ${userEmail}? Esta acción no se puede deshacer.`)) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Error al eliminar usuario');
      }

      toast.success('Usuario eliminado');
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar usuario');
    }
  };

  // Suspender/Reactivar usuario
  const handleToggleSuspend = async (userId: string, userEmail: string, currentlySuspended: boolean) => {
    const action = currentlySuspended ? 'reactivar' : 'suspender';
    if (!confirm(`¿Deseas ${action} al usuario ${userEmail}?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ suspended: !currentlySuspended }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || `Error al ${action} usuario`);
      }

      toast.success(`Usuario ${currentlySuspended ? 'reactivado' : 'suspendido'} exitosamente`);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || `Error al ${action} usuario`);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <Crown className="w-4 h-4 text-yellow-400" />;
      case 'admin':
        return <Shield className="w-4 h-4 text-blue-400" />;
      default:
        return <User className="w-4 h-4 text-gray-400" />;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-yellow-900/30 text-yellow-300 border-yellow-800';
      case 'admin':
        return 'bg-blue-900/30 text-blue-300 border-blue-800';
      default:
        return 'bg-gray-700 text-gray-300 border-gray-600';
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Cargando panel de administración...</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4 sm:space-y-6 p-4 sm:p-0"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
            Panel de Administración
          </h2>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">
            Gestiona usuarios y créditos del sistema
          </p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setShowCreateUser(true)}
          size="sm"
          className="w-full sm:w-auto"
        >
          Crear Usuario
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Usuarios</p>
              <p className="text-2xl font-bold text-white">{users.length}</p>
            </div>
            <Users className="w-8 h-8 text-blue-400" />
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Créditos Totales</p>
              <p className="text-2xl font-bold text-white">
                {users
                  .filter(u => u.role !== 'admin' && u.role !== 'super_admin')
                  .reduce((acc, u) => acc + (u.credits || 0), 0)
                  .toLocaleString()}
              </p>
            </div>
            <Coins className="w-8 h-8 text-green-400" />
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Administradores</p>
              <p className="text-2xl font-bold text-white">
                {users.filter(u => u.role === 'admin' || u.role === 'super_admin').length}
              </p>
            </div>
            <Shield className="w-8 h-8 text-yellow-400" />
          </div>
        </Card>
      </div>

      {/* Tabla de usuarios */}
      <Card>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          {users.length === 0 ? (
            <div className="text-center py-8 sm:py-12 px-4">
              <Users className="w-12 h-12 sm:w-16 sm:h-16 text-gray-600 mx-auto mb-3 sm:mb-4" />
              <p className="text-gray-400 text-base sm:text-lg mb-2">No hay usuarios registrados</p>
              <p className="text-gray-500 text-xs sm:text-sm">Crea el primer usuario para comenzar</p>
            </div>
          ) : (
            <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-gray-400 font-medium text-xs sm:text-sm">Usuario</th>
                <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-gray-400 font-medium text-xs sm:text-sm">Rol</th>
                <th className="text-center py-2 sm:py-3 px-2 sm:px-4 text-gray-400 font-medium text-xs sm:text-sm">Estado</th>
                <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-gray-400 font-medium text-xs sm:text-sm">Créditos</th>
                <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-gray-400 font-medium text-xs sm:text-sm hidden md:table-cell">Creado</th>
                <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-gray-400 font-medium text-xs sm:text-sm">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id} className={`border-b border-gray-700/50 hover:bg-gray-800/30 ${user.suspended ? 'opacity-60' : ''}`}>
                  <td className="py-2 sm:py-3 px-2 sm:px-4">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {getRoleIcon(user.role)}
                      <span className="text-white text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none">{user.email}</span>
                    </div>
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4">
                    <span className={`inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium border ${getRoleBadge(user.role)}`}>
                      {user.role === 'super_admin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'Usuario'}
                    </span>
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium ${
                      user.suspended 
                        ? 'bg-red-900/30 text-red-400 border border-red-700/50' 
                        : 'bg-green-900/30 text-green-400 border border-green-700/50'
                    }`}>
                      {user.suspended ? 'Suspendido' : 'Activo'}
                    </span>
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4 text-right">
                    <span className={`font-semibold text-xs sm:text-sm ${
                      user.credits === 0 ? 'text-red-400' : 
                      user.credits < 100 ? 'text-yellow-400' : 
                      'text-green-400'
                    }`}>
                      {user.credits.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm hidden md:table-cell">
                    {new Date(user.createdAt).toLocaleDateString('es-CO')}
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4">
                    <div className="flex items-center justify-end gap-1 sm:gap-2">
                      <button
                        onClick={() => {
                          console.log('🖱️ Click en agregar créditos, usuario completo:', JSON.stringify(user));
                          console.log('🆔 User ID:', user._id);
                          console.log('📧 User Email:', user.email);
                          console.log('🔑 Todas las propiedades del user:', Object.keys(user));
                          
                          if (!user._id) {
                            console.error('❌ ERROR: user._id está undefined!');
                            toast.error('Error: Usuario sin ID válido');
                            return;
                          }
                          
                          setSelectedUser(user);
                          // Pequeño delay para asegurar que el estado se actualice
                          setTimeout(() => setShowAddCredits(true), 10);
                        }}
                        className="p-1 sm:p-1.5 rounded hover:bg-green-900/30 text-green-400 transition-colors"
                        title="Agregar créditos"
                      >
                        <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                      
                      {user.role !== 'super_admin' && currentUserRole === 'super_admin' && (
                        <button
                          onClick={() => handleChangeRole(user._id, user.role === 'admin' ? 'user' : 'admin')}
                          className="p-1 sm:p-1.5 rounded hover:bg-blue-900/30 text-blue-400 transition-colors"
                          title="Cambiar rol"
                        >
                          <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      )}
                      
                      {user.role !== 'super_admin' && (
                        <>
                          <button
                            onClick={() => handleToggleSuspend(user._id, user.email, user.suspended || false)}
                            className={`p-1 sm:p-1.5 rounded transition-colors ${
                              user.suspended 
                                ? 'hover:bg-green-900/30 text-green-400' 
                                : 'hover:bg-orange-900/30 text-orange-400'
                            }`}
                            title={user.suspended ? 'Reactivar usuario' : 'Suspender usuario'}
                          >
                            {user.suspended ? (
                              <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            ) : (
                              <Ban className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            )}
                          </button>
                          
                          <button
                            onClick={() => handleDeleteUser(user._id, user.email)}
                            className="p-1 sm:p-1.5 rounded hover:bg-red-900/30 text-red-400 transition-colors"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </Card>

      {/* Modal: Crear Usuario */}
      <Modal
        isOpen={showCreateUser}
        onClose={() => {
          setShowCreateUser(false);
          setNewUserEmail('');
          setNewUserPassword('');
          setNewUserRole('user');
          setNewUserCredits(0);
        }}
        title="Crear Nuevo Usuario"
      >
        <div className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="usuario@ejemplo.com"
          />
          
          <Input
            label="Contraseña"
            type="password"
            value={newUserPassword}
            onChange={(e) => setNewUserPassword(e.target.value)}
            placeholder="Contraseña segura"
          />
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Rol
            </label>
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as 'user' | 'admin')}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="user">Usuario</option>
              {currentUserRole === 'super_admin' && <option value="admin">Admin</option>}
            </select>
          </div>
          
          <Input
            label="Créditos Iniciales"
            type="number"
            value={newUserCredits}
            onChange={(e) => setNewUserCredits(parseInt(e.target.value) || 0)}
            placeholder="0"
            min={0}
          />
          
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="secondary"
              onClick={() => setShowCreateUser(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateUser}
            >
              Crear Usuario
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Agregar Créditos */}
      {selectedUser && selectedUser._id && (
        <Modal
          isOpen={showAddCredits}
          onClose={() => {
            setShowAddCredits(false);
            setCreditsToAdd(0);
            setSelectedUser(null);
          }}
          title="Agregar Créditos"
        >
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400">Usuario seleccionado:</p>
              <p className="text-white font-semibold">{selectedUser.email}</p>
              <p className="text-xs text-gray-500 mt-1 font-mono">ID: {selectedUser._id}</p>
              <p className="text-sm text-gray-400 mt-2">Créditos actuales:</p>
              <p className="text-2xl font-bold text-green-400">{(selectedUser.credits || 0).toLocaleString()}</p>
            </div>
            
            <Input
              label="Cantidad de Créditos a Agregar"
              type="number"
              value={creditsToAdd}
              onChange={(e) => setCreditsToAdd(parseInt(e.target.value) || 0)}
              placeholder="1000"
              min={1}
            />
            
            {creditsToAdd > 0 && (
              <div className="bg-green-900/20 border border-green-800 rounded-lg p-3">
                <p className="text-sm text-green-300">
                  Nuevo balance: <span className="font-bold">
                    {((selectedUser.credits || 0) + creditsToAdd).toLocaleString()}
                  </span> créditos
                </p>
              </div>
            )}
            
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="secondary"
                onClick={() => setShowAddCredits(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleAddCredits}
                disabled={creditsToAdd <= 0}
              >
                Agregar Créditos
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </motion.div>
  );
}
