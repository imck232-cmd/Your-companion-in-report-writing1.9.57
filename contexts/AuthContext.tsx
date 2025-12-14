
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

  // Sync system users (supervisors/admins) from INITIAL_USERS to ensure permissions are up to date
  // This fixes issues where stale permissions in localStorage block access (e.g. view_reports_for_specific_teachers)
  useEffect(() => {
    let usersUpdated = false;
    let currentUserUpdated = false;

    // 1. Update the main users list
    const updatedUsers = users.map(u => {
      const initialUser = INITIAL_USERS.find(iu => iu.id === u.id);
      if (initialUser) {
        // Check if critical fields differ (permissions, name, code)
        if (JSON.stringify(u.permissions) !== JSON.stringify(initialUser.permissions) || 
            u.code !== initialUser.code || 
            u.name !== initialUser.name) {
          usersUpdated = true;
          // Merge to keep managedTeacherIds if modified, but enforce system permissions
          return { ...u, ...initialUser, managedTeacherIds: u.managedTeacherIds }; 
        }
      }
      return u;
    });

    if (usersUpdated) {
      setUsers(updatedUsers);
    }

    // 2. Update currentUser if they are logged in and their data is stale
    if (currentUser) {
      const initialUser = INITIAL_USERS.find(iu => iu.id === currentUser.id);
      if (initialUser) {
         if (JSON.stringify(currentUser.permissions) !== JSON.stringify(initialUser.permissions)) {
             setCurrentUser({ ...currentUser, ...initialUser, managedTeacherIds: currentUser.managedTeacherIds });
             currentUserUpdated = true;
         }
      }
    }
  }, []); // Run once on mount

  const isAuthenticated = !!currentUser;

  const login = (username: string, code: string, school: string, year: string): boolean => {
    const user = users.find(u => u.name === username.trim() && u.code === code.trim());
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
    // We keep academicYear so it's pre-filled on next login
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
