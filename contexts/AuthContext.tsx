
import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import { User, School, Permission } from '../types';
import { INITIAL_USERS } from '../constants';

interface AuthContextType {
  isAuthenticated: boolean;
  currentUser: User | null;
  selectedSchool: string | null;
  academicYear: string;
  login: (username: string, code: string, school: string, year: string) => boolean;
  logout: () => void;
  setAcademicYear: (year: string) => void;
  setSelectedSchool: (school: string | null) => void;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useLocalStorage<User | null>('currentUser', null);
  const [selectedSchool, setSelectedSchool] = useLocalStorage<string | null>('selectedSchool', null);
  const [academicYear, setAcademicYear] = useLocalStorage<string>('academicYear', '');
  const [users, setUsers] = useLocalStorage<User[]>('users', INITIAL_USERS);

  // Sync logic: Ensure new users from INITIAL_USERS are added to the local state
  useEffect(() => {
    let usersUpdated = false;
    
    // 1. Merge logic: add missing users and update existing ones
    const currentUsersMap = new Map(users.map(u => [u.id, u]));
    const mergedUsers = [...users];

    INITIAL_USERS.forEach(iu => {
        if (!currentUsersMap.has(iu.id)) {
            // Add missing user (like newly added 'آية فاتق')
            mergedUsers.push(iu);
            usersUpdated = true;
        } else {
            // Update existing user if permissions or code changed in constants
            const existing = currentUsersMap.get(iu.id)!;
            if (JSON.stringify(existing.permissions) !== JSON.stringify(iu.permissions) || 
                existing.code !== iu.code || 
                existing.name !== iu.name) {
                const idx = mergedUsers.findIndex(u => u.id === iu.id);
                mergedUsers[idx] = { ...existing, ...iu, managedTeacherIds: existing.managedTeacherIds };
                usersUpdated = true;
            }
        }
    });

    if (usersUpdated) {
      setUsers(mergedUsers);
    }

    // 2. Update currentUser if they are logged in and their data is stale
    if (currentUser) {
      const initialUser = INITIAL_USERS.find(iu => iu.id === currentUser.id);
      if (initialUser) {
         if (JSON.stringify(currentUser.permissions) !== JSON.stringify(initialUser.permissions) || 
             currentUser.code !== initialUser.code || 
             currentUser.name !== initialUser.name) {
             setCurrentUser({ ...currentUser, ...initialUser, managedTeacherIds: currentUser.managedTeacherIds });
         }
      }
    }
  }, []); // Run once on mount

  const isAuthenticated = !!currentUser;

  const login = (username: string, code: string, school: string, year: string): boolean => {
    // Re-check from the latest users state to ensure "آية فاتق" is found
    const user = users.find(u => u.name.trim() === username.trim() && u.code.trim() === code.trim());
    if (user) {
      setCurrentUser(user);
      setSelectedSchool(school);
      setAcademicYear(year);
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    setSelectedSchool(null);
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!currentUser) return false;
    if (currentUser.permissions.includes('all')) return true;
    return currentUser.permissions.includes(permission);
  };

  const value = useMemo(() => ({
    isAuthenticated,
    currentUser,
    selectedSchool,
    academicYear,
    login,
    logout,
    setAcademicYear,
    setSelectedSchool,
    users,
    setUsers,
    hasPermission,
  }), [isAuthenticated, currentUser, selectedSchool, academicYear, users]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
