import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Shield, Lock, Loader2, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { db } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { deriveKey } from '../lib/crypto';

// Use separate strings for account password and master password
const authSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  accountPassword: z.string().min(6, 'Account password must be at least 6 characters'),
  masterPassword: z.string().min(8, 'Master password must be at least 8 characters'),
});

type AuthFormData = z.infer<typeof authSchema>;

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const login = useStore((state) => state.login);

  const { register, handleSubmit, formState: { errors } } = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
  });

  const onSubmit = async (data: AuthFormData) => {
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        // Authenticate using Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.accountPassword,
        });

        if (authError || !authData.user) {
          throw new Error('Invalid email or account password');
        }

        const supabaseUser = authData.user;

        // Fetch zk_user config
        const zkUser = await db.getUserById(supabaseUser.id);
        if (!zkUser) {
          throw new Error('User profile missing. We could not sync your data.');
        }

        // Derive the localized encryption key from Master Password and user ID as salt
        const key = await deriveKey(data.masterPassword, supabaseUser.id);
        
        login({ id: supabaseUser.id, email: supabaseUser.email! }, key);
        navigate('/dashboard');
      } else {
        // Signup
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: data.email,
          password: data.accountPassword,
        });

        if (authError || !authData.user) {
          throw new Error(authError?.message || 'Failed to create account');
        }

        const supabaseUser = authData.user;

        const key = await deriveKey(data.masterPassword, supabaseUser.id);
        
        // Insert custom user properties into zk_users
        const { error: dbError } = await supabase.from('zk_users').insert({
          id: supabaseUser.id,
          email: supabaseUser.email,
          authhash: 'temp',
          salt: 'temp',
          createdat: Date.now()
        });

        if (dbError) {
          console.error("Failed to inject custom user properties after sign up.", dbError);
          throw new Error('Failed to create account database config: ' + dbError.message);
        }

        login({ id: supabaseUser.id, email: supabaseUser.email! }, key);
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative">
      <Link to="/" className="absolute top-6 left-6 flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm font-medium">Back</span>
      </Link>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-[#111] border border-white/10 rounded-2xl p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">
            {isLogin ? 'Unlock your vault' : 'Create your vault'}
          </h1>
          <p className="text-gray-400 text-sm">
            {isLogin 
              ? 'Enter your credentials and master password.' 
              : 'Secure your vault with a strong master password.'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Email address</label>
            <input
              {...register('email')}
              type="email"
              className="w-full bg-black border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-red-400 text-xs mt-1.5">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Account Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                {...register('accountPassword')}
                type="password"
                className="w-full bg-black border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="Account Access Password"
              />
            </div>
            <p className="text-gray-500 text-xs mt-1.5">Used to log into your Supabase account.</p>
            {errors.accountPassword && <p className="text-red-400 text-xs mt-1.5">{errors.accountPassword.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-blue-400 border-t border-white/5 pt-4 mb-1.5">Zero-Knowledge Master Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
              <input
                {...register('masterPassword')}
                type="password"
                className="w-full bg-black border border-blue-500/30 rounded-lg pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                placeholder="Encryption Master Password"
              />
            </div>
            <p className="text-blue-500/70 text-xs mt-1.5">Only required to encrypt/decrypt locally. Never sent to server.</p>
            {errors.masterPassword && <p className="text-red-400 text-xs mt-1.5">{errors.masterPassword.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg mt-6 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLogin ? 'Unlock Vault' : 'Create Vault'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-400 space-y-3 flex flex-col">
          <div>
            {isLogin ? "Don't have a vault yet? " : "Already have a vault? "}
            <button 
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="text-blue-400 hover:text-blue-300 font-medium"
            >
              {isLogin ? 'Create one' : 'Log in'}
            </button>
          </div>
        </div>
      </motion.div>
      
      <div className="mt-8 text-center max-w-sm">
        <p className="text-xs text-gray-500 leading-relaxed">
          <Lock className="w-3 h-3 inline mr-1 mb-0.5" />
          Zero-knowledge architecture. We cannot recover your master password if you lose it.
        </p>
      </div>
    </div>
  );
}
