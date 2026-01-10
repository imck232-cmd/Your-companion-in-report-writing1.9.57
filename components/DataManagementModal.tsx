
import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { Teacher, Report, SyllabusPlan, School } from '../types';

interface BackupEntry {
    id: string;
    timestamp: string;
    label: string;
    data: { [key: string]: string | null };
}

interface DataManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type ExportMode = 'all' | 'teacher' | 'school' | 'work_type';

const DataManagementModal: React.FC<DataManagementModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    const [backups, setBackups] = useState<BackupEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [exportMode, setExportMode] = useState<ExportMode>('all');
    
    // Selectors for specific exports
    const [selectedTeacherId, setSelectedTeacherId] = useState('');
    const [selectedSchoolName, setSelectedSchoolName] = useState('');
    const [selectedWorkType, setSelectedWorkType] = useState('general');

    // Data from localStorage for selectors
    const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
    const [allSchools, setAllSchools] = useState<School[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            loadBackups();
            loadAppData();
        }
    }, [isOpen]);

    const loadBackups = () => {
        const stored = localStorage.getItem('app_history_backups');
        if (stored) {
            try {
                setBackups(JSON.parse(stored));
            } catch (e) {
                setBackups([]);
            }
        }
    };

    const loadAppData = () => {
        const teachersStr = localStorage.getItem('teachers');
        const schoolsStr = localStorage.getItem('schools');
        if (teachersStr) setAllTeachers(JSON.parse(teachersStr));
        if (schoolsStr) setAllSchools(JSON.parse(schoolsStr));
    };

    const createAutoBackup = () => {
        const currentData: { [key: string]: string | null } = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key !== 'app_history_backups') {
                currentData[key] = localStorage.getItem(key);
            }
        }

        const newBackup: BackupEntry = {
            id: `backup-${Date.now()}`,
            timestamp: new Date().toISOString(),
            label: `تلقائي قبل الاستيراد`,
            data: currentData
        };

        const updatedBackups = [newBackup, ...backups].slice(0, 5);
        localStorage.setItem('app_history_backups', JSON.stringify(updatedBackups));
        setBackups(updatedBackups);
    };

    const handleExport = () => {
        setIsLoading(true);
        try {
            let exportData: { [key: string]: any } = {};
            
            // Collect all potential keys
            const keysToExport = ['teachers', 'reports', 'schools', 'customCriteria', 'specialReportTemplates', 'syllabusPlans', 'tasks', 'meetings', 'peerVisits', 'deliverySheets', 'bulkMessages', 'syllabusCoverageReports', 'supervisoryPlans', 'hiddenCriteria', 'academicYear', 'theme'];

            if (exportMode === 'all') {
                keysToExport.forEach(key => {
                    const val = localStorage.getItem(key);
                    if (val) exportData[key] = val;
                });
            } else {
                // Filtered Export Logic
                keysToExport.forEach(key => {
                    const rawVal = localStorage.getItem(key);
                    if (!rawVal) return;
                    
                    const data = JSON.parse(rawVal);
                    if (!Array.isArray(data)) {
                        exportData[key] = rawVal;
                        return;
                    }

                    let filtered = data;
                    if (exportMode === 'teacher' && selectedTeacherId) {
                        if (key === 'teachers') filtered = data.filter((t: any) => t.id === selectedTeacherId);
                        else if (key === 'reports' || key === 'syllabusCoverageReports') filtered = data.filter((r: any) => r.teacherId === selectedTeacherId);
                        else if (key === 'syllabusPlans') filtered = data; // Keep for context or filter by subject? Usually keep.
                    } 
                    else if (exportMode === 'school' && selectedSchoolName) {
                        if (key === 'teachers' || key === 'reports' || key === 'syllabusPlans' || key === 'syllabusCoverageReports' || key === 'specialReportTemplates') {
                            filtered = data.filter((item: any) => (item.schoolName === selectedSchoolName || item.school === selectedSchoolName));
                        }
                    }
                    else if (exportMode === 'work_type' && selectedWorkType) {
                        if (key === 'reports') filtered = data.filter((r: any) => r.evaluationType === selectedWorkType);
                    }

                    exportData[key] = JSON.stringify(filtered);
                });
            }

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const suffix = exportMode === 'all' ? 'full' : (exportMode === 'teacher' ? `teacher_${selectedTeacherId}` : selectedSchoolName || 'filtered');
            link.download = `backup_reports_${suffix}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            setError('فشل في التصدير');
        } finally {
            setIsLoading(false);
        }
    };

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setError('');

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedContent = e.target?.result as string;
                const parsed = JSON.parse(importedContent);

                if (typeof parsed !== 'object' || parsed === null) {
                    throw new Error('Invalid format');
                }

                if (!window.confirm(t('importWarningText'))) {
                    setIsLoading(false);
                    return;
                }

                // 1. Create Archive of current state
                createAutoBackup();

                // 2. Clear current storage (except backups)
                const backupString = localStorage.getItem('app_history_backups');
                localStorage.clear();
                if (backupString) localStorage.setItem('app_history_backups', backupString);

                // 3. Inject new data
                Object.keys(parsed).forEach(key => {
                    if (key !== 'app_history_backups') {
                        localStorage.setItem(key, parsed[key]);
                    }
                });

                alert(t('importSuccess'));
                window.location.reload();
            } catch (err) {
                setError(t('invalidFile'));
                setIsLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const handleRestore = (backup: BackupEntry) => {
        if (!window.confirm('هل أنت متأكد؟ سيتم استبدال البيانات الحالية بالنسخة المختارة.')) return;

        setIsLoading(true);
        try {
            const backupString = localStorage.getItem('app_history_backups');
            localStorage.clear();
            if (backupString) localStorage.setItem('app_history_backups', backupString);

            Object.keys(backup.data).forEach(key => {
                const val = backup.data[key];
                if (val !== null) localStorage.setItem(key, val);
            });

            alert(t('restoreSuccess'));
            window.location.reload();
        } catch (e) {
            setError('فشل في الاستعادة');
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    const OptionCard = ({ mode, title, subtitle, icon }: { mode: ExportMode, title: string, subtitle: string, icon: React.ReactNode }) => (
        <div 
            onClick={() => setExportMode(mode)}
            className={`cursor-pointer p-4 border-2 rounded-xl transition-all flex items-start gap-3 relative ${exportMode === mode ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-gray-200 hover:border-primary/50'}`}
        >
            <div className="flex-grow">
                <h4 className="font-bold text-gray-800 text-sm md:text-base">{title}</h4>
                <p className="text-xs text-gray-500">{subtitle}</p>
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${exportMode === mode ? 'border-primary bg-primary' : 'border-gray-300'}`}>
                {exportMode === mode && <div className="w-2 h-2 bg-white rounded-full"></div>}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[95vh]">
                
                {/* Header */}
                <div className="p-6 border-b flex justify-between items-start bg-gray-50/50">
                    <div>
                        <h2 className="text-2xl font-bold text-primary">{t('dataManagementTransfer')}</h2>
                        <p className="text-sm text-gray-500 mt-1">{t('dataManagementSubtitle')}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors text-3xl">&times;</button>
                </div>

                <div className="p-6 overflow-y-auto space-y-8">
                    
                    {/* Section 1: Export */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                             <div className="p-2 bg-green-100 text-green-700 rounded-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                             </div>
                             <h3 className="text-lg font-bold text-gray-800">{t('exportData')}</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <OptionCard mode="all" title={t('exportModeAll')} subtitle={t('exportModeAllSubtitle')} icon={null} />
                            <OptionCard mode="teacher" title={t('exportModeTeacher')} subtitle={t('exportModeTeacherSubtitle')} icon={null} />
                            <OptionCard mode="work_type" title={t('exportModeWorkType')} subtitle={t('exportModeWorkTypeSubtitle')} icon={null} />
                            <OptionCard mode="school" title={t('exportModeSchool')} subtitle={t('exportModeSchoolSubtitle')} icon={null} />
                        </div>

                        {/* Conditional Selectors */}
                        <div className="animate-fadeIn">
                            {exportMode === 'teacher' && (
                                <div className="p-4 bg-gray-50 border rounded-xl space-y-2">
                                    <label className="text-sm font-bold text-gray-700">{t('selectTeacherToExport')}</label>
                                    <select 
                                        value={selectedTeacherId} 
                                        onChange={e => setSelectedTeacherId(e.target.value)}
                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                    >
                                        <option value="">-- اختر المعلم --</option>
                                        {allTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                            )}
                            {exportMode === 'school' && (
                                <div className="p-4 bg-gray-50 border rounded-xl space-y-2">
                                    <label className="text-sm font-bold text-gray-700">{t('selectSchoolToExport')}</label>
                                    <select 
                                        value={selectedSchoolName} 
                                        onChange={e => setSelectedSchoolName(e.target.value)}
                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                    >
                                        <option value="">-- اختر المدرسة --</option>
                                        {allSchools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                    </select>
                                </div>
                            )}
                            {exportMode === 'work_type' && (
                                <div className="p-4 bg-gray-50 border rounded-xl space-y-2">
                                    <label className="text-sm font-bold text-gray-700">{t('selectWorkTypeToExport')}</label>
                                    <select 
                                        value={selectedWorkType} 
                                        onChange={e => setSelectedWorkType(e.target.value)}
                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                                    >
                                        <option value="general">{t('generalEvaluation')}</option>
                                        <option value="class_session">{t('classSessionEvaluation')}</option>
                                        <option value="special">{t('specialReports')}</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={handleExport}
                            disabled={isLoading || (exportMode === 'teacher' && !selectedTeacherId) || (exportMode === 'school' && !selectedSchoolName)}
                            className="w-full py-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold flex items-center justify-center gap-3 shadow-lg active:scale-95 disabled:bg-gray-300 disabled:scale-100"
                        >
                            {isLoading ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div> : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            )}
                            {t('exportData')}
                        </button>
                    </div>

                    <div className="border-t pt-8 space-y-6">
                        {/* Section 2: Import */}
                        <div className="flex items-center gap-2 mb-2">
                             <div className="p-2 bg-red-100 text-red-700 rounded-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                             </div>
                             <h3 className="text-lg font-bold text-red-600">{t('importDataFile')}</h3>
                        </div>

                        {/* Import Warning */}
                        <div className="p-4 bg-red-50 border-r-4 border-red-600 rounded-lg flex gap-3">
                            <div className="flex-shrink-0 mt-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            </div>
                            <div>
                                <h5 className="font-bold text-red-900 text-sm">{t('importantWarningTitle')}</h5>
                                <p className="text-xs text-red-800 leading-relaxed mt-1">{t('importWarningText')}</p>
                            </div>
                        </div>

                        {/* Drop Zone Area */}
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-gray-300 rounded-2xl p-10 flex flex-col items-center justify-center gap-4 bg-gray-50 hover:bg-primary/5 hover:border-primary transition-all group cursor-pointer"
                        >
                            <input type="file" accept=".json" onChange={handleImport} className="hidden" ref={fileInputRef} />
                            <div className="w-16 h-16 bg-white shadow-sm rounded-full flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-gray-700">{t('dragAndDropJson')}</p>
                                <p className="text-xs text-gray-400 mt-1">{t('supportedFilesJson')}</p>
                            </div>
                        </div>

                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-4 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all font-bold flex items-center justify-center gap-3 shadow active:scale-95"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                            {t('importFileBtn')}
                        </button>
                    </div>

                    {/* Backups List */}
                    {backups.length > 0 && (
                        <div className="border-t pt-8 space-y-4">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                                {t('backupsHistory')}
                            </h3>
                            <div className="space-y-2">
                                {backups.map((backup, index) => (
                                    <div key={backup.id} className="p-3 bg-gray-50 border rounded-xl flex justify-between items-center group">
                                        <div>
                                            <p className="font-bold text-sm text-gray-800">{backup.label} (#{backups.length - index})</p>
                                            <p className="text-xs text-gray-500">{new Date(backup.timestamp).toLocaleString('ar-YE')}</p>
                                        </div>
                                        <button 
                                            onClick={() => handleRestore(backup)}
                                            className="px-4 py-1.5 bg-white border border-primary text-primary rounded-lg text-xs font-bold hover:bg-primary hover:text-white transition-all shadow-sm"
                                        >
                                            {t('restore')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {error && <p className="text-red-600 text-center font-bold animate-shake">{error}</p>}
                </div>

                {/* Footer Footer */}
                <div className="p-6 bg-gray-50 border-t flex justify-between items-center">
                    <button onClick={onClose} className="px-8 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-all font-bold shadow-sm">
                        {t('cancel')}
                    </button>
                    <p className="text-xs text-gray-400 italic">برنامج رفيقك في كتابة التقارير v1.9.57</p>
                </div>
            </div>
        </div>
    );
};

export default DataManagementModal;
