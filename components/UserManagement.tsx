
import React, { useState } from 'react';
import { User, Teacher, Permission } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import UserDetailsModal from './UserDetailsModal';
import { SUPERVISOR_PERMISSIONS, TEACHER_PERMISSIONS } from '../constants';

interface UserManagementProps {
    allTeachers: Teacher[];
}

const UserManagement: React.FC<UserManagementProps> = ({ allTeachers }) => {
    const { t } = useLanguage();
    const { users, setUsers, hasPermission } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    if (!hasPermission('manage_users')) {
        return <div className="text-center p-8 text-red-500">You do not have permission to access this page.</div>;
    }

    const generateUniqueCode = async (): Promise<string> => {
        setIsLoading(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const existingCodes = users.map(u => u.code);
            const prompt = `Generate a unique 4-digit numeric code that is not sequential and not in this list: [${existingCodes.join(', ')}]. Respond ONLY with the 4-digit code.`;
            
            let attempts = 0;
            while(attempts < 5) {
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                });

                const text = response.text?.trim().match(/\d{4}/)?.[0]; // Extract first 4-digit number
                if (text && !existingCodes.includes(text)) {
                    setIsLoading(false);
                    return text;
                }
                attempts++;
            }
            throw new Error("AI failed to generate a unique code.");
        } catch (error) {
            console.error("Code generation failed:", error);
            // Fallback to a random generator
            let randomCode = '';
            do {
                randomCode = Math.floor(1000 + Math.random() * 9000).toString();
            } while (users.map(u => u.code).includes(randomCode));
            setIsLoading(false);
            return randomCode;
        }
    };

    const handleAddNewUser = (type: 'supervisor' | 'teacher') => {
        const defaultPermissions = type === 'supervisor' ? SUPERVISOR_PERMISSIONS : TEACHER_PERMISSIONS;
        const newUser: User = {
            id: `user-new-${Date.now()}`,
            name: '',
            code: '',
            permissions: defaultPermissions,
            managedTeacherIds: []
        };
        setEditingUser(newUser);
    };
    
    const handleSaveUser = (userToSave: User) => {
        setUsers(prev => {
            const existing = prev.find(u => u.id === userToSave.id);
            if (existing) {
                return prev.map(u => u.id === userToSave.id ? userToSave : u);
            }
            const finalNewUser = { ...userToSave, id: `user-${Date.now()}`};
            return [...prev, finalNewUser];
        });
        setEditingUser(null);
    };

    const handleDeleteUser = (userId: string) => {
        if (window.confirm(t('confirmDelete'))) {
            setUsers(prev => prev.filter(u => u.id !== userId));
        }
    };

    // Filter Logic
    const supervisorUsers = users.filter(u => 
        u.permissions.includes('all') || u.permissions.includes('change_school') // Heuristic for admins/supervisors
    );
    
    const teacherUsers = users.filter(u => 
        !u.permissions.includes('all') && 
        !u.permissions.includes('change_school') && 
        u.permissions.includes('view_syllabus_coverage')
    );

    const UserListSection: React.FC<{ title: string, usersList: User[], onAdd: () => void }> = ({ title, usersList, onAdd }) => (
        <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="text-xl font-bold text-primary">{title}</h3>
                <button onClick={onAdd} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-bold transition-colors">
                    + إضافة أسماء آخرين
                </button>
            </div>
            <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                {usersList.map(user => (
                    <div key={user.id} className="p-3 bg-white border rounded-lg flex justify-between items-center shadow-sm">
                        <div>
                            <p className="font-bold">{user.name}</p>
                            <p className="text-sm text-gray-600 font-mono">الكود: {user.code}</p>
                        </div>
                        <div className="flex gap-2">
                             <button onClick={() => setEditingUser(user)} className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200">{t('edit')}</button>
                             {user.permissions[0] !== 'all' && <button onClick={() => handleDeleteUser(user.id)} className="text-sm bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200">{t('delete')}</button>}
                        </div>
                    </div>
                ))}
                {usersList.length === 0 && <p className="text-gray-500 text-center py-4">لا يوجد مستخدمين في هذه المجموعة.</p>}
            </div>
        </div>
    );

    return (
        <div className="p-6 bg-white rounded-lg shadow-lg space-y-8">
            {editingUser && (
                <UserDetailsModal 
                    user={editingUser}
                    allTeachers={allTeachers}
                    onSave={handleSaveUser}
                    onCancel={() => setEditingUser(null)}
                    generateCode={generateUniqueCode}
                    isGeneratingCode={isLoading}
                />
            )}
            
            <h2 className="text-2xl font-bold text-center text-primary border-b pb-4">{t('userManagement')}</h2>
            
            <UserListSection 
                title="المشرفون والإداريون (الحقل الأول)" 
                usersList={supervisorUsers} 
                onAdd={() => handleAddNewUser('supervisor')} 
            />

            <UserListSection 
                title="المعلمون (الحقل الثاني)" 
                usersList={teacherUsers} 
                onAdd={() => handleAddNewUser('teacher')} 
            />
        </div>
    );
};


export default UserManagement;
