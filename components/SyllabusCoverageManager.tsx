
import React, { useState, useMemo, useRef } from 'react';
import { SyllabusCoverageReport, SyllabusBranchProgress, Teacher } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { SUBJECTS, GRADES, SUBJECT_BRANCH_MAP } from '../constants';
import { exportSyllabusCoverage } from '../lib/exportUtils';
import CustomizableInputSection from './CustomizableInputSection';
import ImportDataSection from './ImportDataSection';

// Declare XLSX for import functionality
declare const XLSX: any;

interface SyllabusCoverageManagerProps {
    reports: SyllabusCoverageReport[];
    setReports: React.Dispatch<React.SetStateAction<SyllabusCoverageReport[]>>;
    school: string;
    academicYear: string;
    semester: 'الأول' | 'الثاني';
    allTeachers: Teacher[];
}

const ReportEditor: React.FC<{
    report: SyllabusCoverageReport;
    allReports: SyllabusCoverageReport[];
    allTeachers: Teacher[];
    onUpdate: (updatedReport: SyllabusCoverageReport) => void;
    onDelete: (reportId: string) => void;
}> = ({ report, onUpdate, onDelete, allTeachers, allReports }) => {
    const { t } = useLanguage();
    const [otherSubject, setOtherSubject] = useState(SUBJECTS.includes(report.subject) ? '' : report.subject);
    const [otherGrade, setOtherGrade] = useState(GRADES.includes(report.grade) ? '' : report.grade);
    const [isSaving, setIsSaving] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const teacherMap = useMemo(() => new Map(allTeachers.map(t => [t.id, t.name])), [allTeachers]);

    const handleTeacherChange = (newTeacherId: string) => {
        const latestReportForTeacher = allReports
            .filter(r => r.teacherId === newTeacherId && r.id !== report.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

        onUpdate({
            ...report,
            teacherId: newTeacherId,
            branch: latestReportForTeacher?.branch || report.branch,
        });
    };
    
    const handleHeaderChange = (field: keyof SyllabusCoverageReport, value: string) => {
        const updatedReport = { ...report, [field]: value };
    
        if (field === 'subject') {
            let subjectValue = value;
            if (value === 'other') {
                subjectValue = otherSubject;
            } else {
                setOtherSubject('');
            }
            updatedReport.subject = subjectValue;
    
            const branches = SUBJECT_BRANCH_MAP[subjectValue] || [];
            const newBranches: SyllabusBranchProgress[] = branches.map(branchName => {
                const existing = report.branches.find(b => b.branchName === branchName);
                return existing || { branchName, status: 'not_set', lastLesson: '', lessonDifference: '', percentage: 0 };
            });
            updatedReport.branches = newBranches;
        }

        if(field === 'grade' && value === 'other'){
            updatedReport.grade = otherGrade;
        }
    
        onUpdate(updatedReport as SyllabusCoverageReport);
    };
    
    const handleBranchUpdate = (branchIndex: number, field: keyof SyllabusBranchProgress, value: string) => {
        const newBranches = [...report.branches];
        const branchToUpdate = { ...newBranches[branchIndex] };

        if (field === 'status') {
            branchToUpdate.status = value as SyllabusBranchProgress['status'];
            branchToUpdate.lessonDifference = ''; 
            if (value === 'on_track') branchToUpdate.percentage = 100;
            else if (value === 'ahead') branchToUpdate.percentage = 100;
            else branchToUpdate.percentage = 0;
        } else {
            (branchToUpdate as any)[field] = value;
        }

        newBranches[branchIndex] = branchToUpdate;
        onUpdate({ ...report, branches: newBranches });
    };
    
    // Handler for new dynamic fields
    const handleFieldUpdate = (field: keyof SyllabusCoverageReport, value: string) => {
        onUpdate({ ...report, [field]: value });
    };

    // AI Import Handler
    const handleDataParsed = (parsedData: Partial<SyllabusCoverageReport>) => {
        const updatedReport = { ...report };
        
        // Simple fields
        for (const key of ['schoolName', 'academicYear', 'semester', 'subject', 'grade', 'meetingsAttended', 'notebookCorrection', 'preparationBook', 'questionsGlossary', 'programsImplemented', 'strategiesImplemented', 'toolsUsed', 'sourcesUsed', 'tasksDone', 'testsDelivered', 'peerVisitsDone']) {
            if (parsedData[key as keyof typeof parsedData]) {
                (updatedReport as any)[key] = parsedData[key as keyof typeof parsedData];
            }
        }
        
        // Try to match teacher by name if ID isn't provided
        if ((parsedData as any).teacherName) {
            const foundTeacher = allTeachers.find(t => t.name.includes((parsedData as any).teacherName));
            if (foundTeacher) updatedReport.teacherId = foundTeacher.id;
        }

        onUpdate(updatedReport);
        setShowImport(false);
    };

    // Excel Import Logic (Updated for RawData support)
    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                
                let data: any[] = [];
                let isRaw = false;

                // Check if the "RawData" sheet exists (added in new export function)
                if (wb.SheetNames.includes("RawData")) {
                    const wsRaw = wb.Sheets["RawData"];
                    data = XLSX.utils.sheet_to_json(wsRaw);
                    isRaw = true;
                } else {
                    // Fallback to reading the first sheet (legacy behavior)
                    const wsname = wb.SheetNames[0];
                    const ws = wb.Sheets[wsname];
                    data = XLSX.utils.sheet_to_json(ws);
                }

                if (data.length > 0) {
                    const row = data[0]; 
                    const updatedReport = { ...report };
                    
                    if (isRaw) {
                         // Full fidelity import from RawData sheet
                         Object.keys(row).forEach(key => {
                             if (key === 'branches') {
                                 try {
                                     // Branches are stored as a JSON string in the raw export
                                     updatedReport.branches = JSON.parse(row[key]);
                                 } catch (e) { 
                                     console.error("Error parsing branches JSON", e); 
                                 }
                             } else if (key !== 'id') { 
                                 // Update fields, skipping ID to avoid overwriting current ID if needed (or allow overwrite if intent is full restore)
                                 // Here we overwrite everything except ID to keep the current UI context valid unless we want to fully clone.
                                 // Let's copy values to the current report object.
                                 (updatedReport as any)[key] = row[key];
                             }
                         });
                    } else {
                        // Legacy logic for older files or files not generated by the new export
                        if(row['المعلم']) updatedReport.teacherId = allTeachers.find(t => t.name === row['المعلم'])?.id || report.teacherId;
                        if(row['المادة']) updatedReport.subject = row['المادة'];
                        if(row['الصف']) updatedReport.grade = row['الصف'];
                        if(row['العام الدراسي']) updatedReport.academicYear = row['العام الدراسي'];
                        if(row['المدرسة']) updatedReport.schoolName = row['المدرسة'];
                        
                        if(row['اللقاءات']) updatedReport.meetingsAttended = String(row['اللقاءات']);
                        if(row['التصحيح']) updatedReport.notebookCorrection = String(row['التصحيح']).replace('%', '');
                        if(row['التحضير']) updatedReport.preparationBook = String(row['التحضير']).replace('%', '');
                        
                        if(row['الاستراتيجيات']) updatedReport.strategiesImplemented = row['الاستراتيجيات'];
                        if(row['الوسائل']) updatedReport.toolsUsed = row['الوسائل'];
                    }
                    
                    onUpdate(updatedReport);
                    alert('تم استيراد البيانات بنجاح.');
                }
            } catch (error) {
                console.error("Import error:", error);
                alert('حدث خطأ أثناء قراءة الملف. يرجى التأكد من الصيغة.');
            }
        };
        reader.readAsBinaryString(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => setIsSaving(false), 1500);
    };

    const reportTitle = t('reportTitle')
        .replace('{subject}', report.subject || `(${t('subject')})`)
        .replace('{grade}', report.grade || `(${t('grade')})`)
        .replace('{semester}', report.semester)
        .replace('{academicYear}', report.academicYear);

    const teacherName = teacherMap.get(report.teacherId) || '';
    const isOtherSubject = !SUBJECTS.includes(report.subject) || report.subject === 'أخرى';
    const isOtherGrade = !GRADES.includes(report.grade) || report.grade === 'أخرى';

    const percentageOptions = Array.from({length: 20}, (_, i) => (i + 1) * 5).map(String); // 5, 10 ... 100

    const formStructureForAI = useMemo(() => ({
        schoolName: '', academicYear: '', semester: '', teacherName: '', subject: '', grade: '',
        meetingsAttended: '0', notebookCorrection: '0', preparationBook: '0', questionsGlossary: '0',
        programsImplemented: '', strategiesImplemented: '', toolsUsed: '', sourcesUsed: '', tasksDone: '', testsDelivered: '', peerVisitsDone: ''
    }), []);

    return (
        <div className="p-4 border-2 border-primary-light rounded-xl space-y-4 bg-white shadow-sm transition-all">
            <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsCollapsed(!isCollapsed)}>
                <div className="flex items-center gap-2">
                    <span className={`transform transition-transform text-primary text-xl ${isCollapsed ? 'rotate-0' : 'rotate-180'}`}>▼</span>
                    <h3 className="text-lg font-semibold text-primary">{report.teacherId ? reportTitle : t('addNewSyllabusReport')}</h3>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onDelete(report.id); }} className="text-red-500 hover:text-red-700 p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </div>
            
            {!isCollapsed && (
            <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg border">
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">{t('schoolName')}</label>
                        <input type="text" value={report.schoolName} onChange={e => handleHeaderChange('schoolName', e.target.value)} className="w-full p-2 border rounded" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">{t('academicYear')}</label>
                        <input type="text" value={report.academicYear} onChange={e => handleHeaderChange('academicYear', e.target.value)} className="w-full p-2 border rounded" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">{t('semester')}</label>
                        <select value={report.semester} onChange={e => handleHeaderChange('semester', e.target.value)} className="w-full p-2 border rounded">
                            <option value="الأول">{t('semester1')}</option>
                            <option value="الثاني">{t('semester2')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">{t('teacherName')}</label>
                        <select value={report.teacherId} onChange={e => handleTeacherChange(e.target.value)} className="w-full p-2 border rounded">
                            <option value="">-- اختر --</option>
                            {allTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">{t('subject')}</label>
                        <div className="flex gap-1">
                            <select value={isOtherSubject ? 'other' : report.subject} onChange={e => handleHeaderChange('subject', e.target.value)} className="w-full p-2 border rounded">
                                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {isOtherSubject && <input type="text" value={otherSubject} onChange={e => { setOtherSubject(e.target.value); handleHeaderChange('subject', e.target.value) }} className="w-full p-2 border rounded" />}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">{t('grade')}</label>
                        <div className="flex gap-1">
                            <select value={isOtherGrade ? 'other' : report.grade} onChange={e => handleHeaderChange('grade', e.target.value)} className="w-full p-2 border rounded">
                                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                            {isOtherGrade && <input type="text" value={otherGrade} onChange={e => { setOtherGrade(e.target.value); handleHeaderChange('grade', e.target.value) }} className="w-full p-2 border rounded" />}
                        </div>
                    </div>
                </div>

                {report.branches.length > 0 && (
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full border-collapse">
                            <thead className="bg-blue-100">
                                <tr>
                                    <th className="p-2 border text-sm">{t('branch')}</th>
                                    <th className="p-2 border text-sm">{t('lastLesson')}</th>
                                    <th className="p-2 border text-sm">{t('status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.branches.map((b, i) => (
                                    <tr key={i}>
                                        <td className="p-2 border font-bold text-sm bg-gray-50">{b.branchName}</td>
                                        <td className="p-2 border">
                                            <input type="text" value={b.lastLesson} onChange={e => handleBranchUpdate(i, 'lastLesson', e.target.value)} className="w-full p-1 border rounded" />
                                        </td>
                                        <td className="p-2 border">
                                            <div className="flex gap-2">
                                                <select value={b.status} onChange={e => handleBranchUpdate(i, 'status', e.target.value)} className="p-1 border rounded text-sm flex-grow">
                                                    <option value="not_set">--</option>
                                                    <option value="on_track">{t('statusOnTrack')}</option>
                                                    <option value="ahead">{t('statusAhead')}</option>
                                                    <option value="behind">{t('statusBehind')}</option>
                                                </select>
                                                {(b.status === 'ahead' || b.status === 'behind') && (
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-xs">بعدد</span>
                                                        <input 
                                                            type="number" 
                                                            value={b.lessonDifference} 
                                                            onChange={e => handleBranchUpdate(i, 'lessonDifference', e.target.value)} 
                                                            className="w-12 p-1 border rounded text-center" 
                                                        />
                                                        <span className="text-xs">دروس</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div>
                        <label className="text-xs font-bold block mb-1">{t('meetingsAttended')}</label>
                        <input type="number" value={report.meetingsAttended || ''} onChange={e => handleFieldUpdate('meetingsAttended', e.target.value)} className="w-full p-2 border rounded bg-white" />
                    </div>
                    <div>
                        <label className="text-xs font-bold block mb-1">{t('notebookCorrection')}</label>
                        <select value={report.notebookCorrection || ''} onChange={e => handleFieldUpdate('notebookCorrection', e.target.value)} className="w-full p-2 border rounded bg-white">
                            <option value="">-- % --</option>
                            {percentageOptions.map(p => <option key={p} value={p}>{p}%</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold block mb-1">{t('preparationBook')}</label>
                        <select value={report.preparationBook || ''} onChange={e => handleFieldUpdate('preparationBook', e.target.value)} className="w-full p-2 border rounded bg-white">
                            <option value="">-- % --</option>
                            {percentageOptions.map(p => <option key={p} value={p}>{p}%</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold block mb-1">{t('questionsGlossary')}</label>
                        <select value={report.questionsGlossary || ''} onChange={e => handleFieldUpdate('questionsGlossary', e.target.value)} className="w-full p-2 border rounded bg-white">
                            <option value="">-- % --</option>
                            {percentageOptions.map(p => <option key={p} value={p}>{p}%</option>)}
                        </select>
                    </div>
                </div>

                <div className="space-y-4">
                    <CustomizableInputSection 
                        title={t('programsUsed')} 
                        value={report.programsImplemented || ''} 
                        onChange={v => handleFieldUpdate('programsImplemented', v)} 
                        defaultItems={[]} 
                        localStorageKey="customPrograms" 
                        isList={true} 
                    />
                    <CustomizableInputSection 
                        title={t('strategiesUsed')} 
                        value={report.strategiesImplemented || ''} 
                        onChange={v => handleFieldUpdate('strategiesImplemented', v)} 
                        defaultItems={['التعلم التعاوني', 'العصف الذهني', 'الحوار والمناقشة']} 
                        localStorageKey="customStrategies" 
                        isList={true} 
                    />
                    <CustomizableInputSection 
                        title={t('toolsUsed')} 
                        value={report.toolsUsed || ''} 
                        onChange={v => handleFieldUpdate('toolsUsed', v)} 
                        defaultItems={['السبورة', 'جهاز العرض', 'نماذج ومجسمات']} 
                        localStorageKey="customTools" 
                        isList={true} 
                    />
                    <CustomizableInputSection 
                        title={t('sourcesUsed')} 
                        value={report.sourcesUsed || ''} 
                        onChange={v => handleFieldUpdate('sourcesUsed', v)} 
                        defaultItems={['الكتاب المدرسي', 'دليل المعلم', 'الانترنت']} 
                        localStorageKey="customSources" 
                        isList={true} 
                    />
                    <CustomizableInputSection 
                        title={t('tasksDone')} 
                        value={report.tasksDone || ''} 
                        onChange={v => handleFieldUpdate('tasksDone', v)} 
                        defaultItems={[]} 
                        localStorageKey="customTasks" 
                        isList={true} 
                    />
                    <CustomizableInputSection 
                        title={t('testsDelivered')} 
                        value={report.testsDelivered || ''} 
                        onChange={v => handleFieldUpdate('testsDelivered', v)} 
                        defaultItems={['اختبار الشهر الأول', 'اختبار الشهر الثاني', 'اختبار تجريبي']} 
                        localStorageKey="customTests" 
                        isList={true} 
                    />
                    <CustomizableInputSection 
                        title={t('peerVisitsDone')} 
                        value={report.peerVisitsDone || ''} 
                        onChange={v => handleFieldUpdate('peerVisitsDone', v)} 
                        defaultItems={[]} 
                        localStorageKey="customPeerVisits" 
                        isList={true} 
                    />
                </div>

                <div className="flex flex-wrap justify-center gap-3 pt-4 border-t">
                    <button onClick={handleSave} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all transform hover:scale-105" disabled={isSaving}>
                        {isSaving ? `${t('save')}...` : t('saveWork')}
                    </button>
                    <button onClick={() => setShowImport(!showImport)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                        {t('importData')}
                    </button>
                    <button onClick={() => {
                        if (fileInputRef.current) {
                            fileInputRef.current.click();
                        }
                    }} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                       {t('fillFromExcel')}
                    </button>
                    {/* Hidden input for excel file */}
                    <input 
                        type="file" 
                        accept=".xlsx, .xls" 
                        ref={fileInputRef} 
                        style={{display: 'none'}} 
                        onChange={handleImportExcel}
                    />

                    <button onClick={() => exportSyllabusCoverage('txt', report, teacherName, t)} className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800">{t('exportTxt')}</button>
                    <button onClick={() => exportSyllabusCoverage('pdf', report, teacherName, t)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">{t('exportPdf')}</button>
                    <button onClick={() => exportSyllabusCoverage('excel', report, teacherName, t)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">{t('exportExcel')}</button>
                    <button onClick={() => exportSyllabusCoverage('whatsapp', report, teacherName, t)} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">{t('sendToWhatsApp')}</button>
                </div>

                {showImport && (
                    <ImportDataSection 
                        onDataParsed={handleDataParsed}
                        formStructure={formStructureForAI}
                    />
                )}
            </>
            )}
        </div>
    );
};

const FilterTableModal: React.FC<{
    reports: SyllabusCoverageReport[];
    allTeachers: Teacher[];
    onClose: () => void;
    onViewReports: (selectedIds: string[]) => void;
}> = ({ reports, allTeachers, onClose, onViewReports }) => {
    const { t } = useLanguage();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    
    // Filter States
    const [filterTeacher, setFilterTeacher] = useState('all');
    const [filterGrade, setFilterGrade] = useState('all');
    const [filterSubject, setFilterSubject] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all'); // all, ahead, behind, highest, lowest

    const teacherMap = useMemo(() => new Map(allTeachers.map(t => [t.id, t.name])), [allTeachers]);

    const filteredReports = useMemo(() => {
        let result = reports.filter(r => {
            const matchTeacher = filterTeacher === 'all' || r.teacherId === filterTeacher;
            const matchGrade = filterGrade === 'all' || r.grade === filterGrade;
            const matchSubject = filterSubject === 'all' || r.subject === filterSubject;
            return matchTeacher && matchGrade && matchSubject;
        });

        if (filterStatus === 'ahead') {
            result = result.filter(r => r.branches.some(b => b.status === 'ahead'));
        } else if (filterStatus === 'behind') {
            result = result.filter(r => r.branches.some(b => b.status === 'behind'));
        } else if (filterStatus === 'highest') {
            // Sort by average numeric completion (correction, prep, etc)
            result.sort((a,b) => {
               const avgA = (parseFloat(a.notebookCorrection||'0') + parseFloat(a.preparationBook||'0')) / 2;
               const avgB = (parseFloat(b.notebookCorrection||'0') + parseFloat(b.preparationBook||'0')) / 2;
               return avgB - avgA;
            });
        } else if (filterStatus === 'lowest') {
             result.sort((a,b) => {
               const avgA = (parseFloat(a.notebookCorrection||'0') + parseFloat(a.preparationBook||'0')) / 2;
               const avgB = (parseFloat(b.notebookCorrection||'0') + parseFloat(b.preparationBook||'0')) / 2;
               return avgA - avgB;
            });
        }

        return result;
    }, [reports, filterTeacher, filterGrade, filterSubject, filterStatus]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredReports.length) setSelectedIds([]);
        else setSelectedIds(filteredReports.map(r => r.id));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="text-xl font-bold text-primary">تصفية التقارير</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>
                
                <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 border-b bg-gray-50">
                    <select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)} className="p-2 border rounded">
                        <option value="all">كل المعلمين</option>
                        {allTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className="p-2 border rounded">
                        <option value="all">كل الصفوف</option>
                        {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} className="p-2 border rounded">
                        <option value="all">كل المواد</option>
                        {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="p-2 border rounded">
                        <option value="all">الكل</option>
                        <option value="ahead">{t('statusAhead')}</option>
                        <option value="behind">{t('statusBehind')}</option>
                        <option value="highest">الأعلى نسبة إنجاز</option>
                        <option value="lowest">الأدنى نسبة إنجاز</option>
                    </select>
                </div>

                <div className="flex-grow overflow-auto p-4">
                    <table className="min-w-full border-collapse text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                            <tr>
                                <th className="p-3 border text-center"><input type="checkbox" checked={selectedIds.length === filteredReports.length && filteredReports.length > 0} onChange={toggleSelectAll} /></th>
                                <th className="p-3 border text-right">المعلم</th>
                                <th className="p-3 border text-right">المادة / الصف</th>
                                <th className="p-3 border text-center">التصحيح</th>
                                <th className="p-3 border text-center">التحضير</th>
                                <th className="p-3 border text-center">حالة المنهج</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredReports.map(r => {
                                const status = r.branches.some(b => b.status === 'behind') ? 'behind' : (r.branches.some(b => b.status === 'ahead') ? 'ahead' : 'on_track');
                                const statusColor = status === 'behind' ? 'text-red-600' : (status === 'ahead' ? 'text-blue-600' : 'text-green-600');
                                const statusText = status === 'behind' ? t('statusBehind') : (status === 'ahead' ? t('statusAhead') : t('statusOnTrack'));

                                return (
                                    <tr key={r.id} className="hover:bg-blue-50 cursor-pointer" onClick={() => toggleSelect(r.id)}>
                                        <td className="p-3 border text-center"><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} onClick={e => e.stopPropagation()} /></td>
                                        <td className="p-3 border font-semibold">{teacherMap.get(r.teacherId)}</td>
                                        <td className="p-3 border">{r.subject} - {r.grade}</td>
                                        <td className="p-3 border text-center">{r.notebookCorrection ? r.notebookCorrection + '%' : '-'}</td>
                                        <td className="p-3 border text-center">{r.preparationBook ? r.preparationBook + '%' : '-'}</td>
                                        <td className={`p-3 border text-center font-bold ${statusColor}`}>{statusText}</td>
                                    </tr>
                                );
                            })}
                            {filteredReports.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-500">لا توجد نتائج</td></tr>}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t flex justify-end gap-3 bg-gray-50 rounded-b-xl">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">إغلاق</button>
                    <button onClick={() => onViewReports(selectedIds)} disabled={selectedIds.length === 0} className="px-6 py-2 bg-primary text-white rounded hover:bg-opacity-90 disabled:bg-gray-300 font-bold">
                        عرض التقارير المحددة ({selectedIds.length})
                    </button>
                </div>
            </div>
        </div>
    );
};


const SyllabusCoverageManager: React.FC<SyllabusCoverageManagerProps> = (props) => {
    const { reports, setReports, school, academicYear, semester, allTeachers } = props;
    const { t } = useLanguage();
    const { currentUser } = useAuth();
    const [showFilter, setShowFilter] = useState(false);
    const [filteredReportIds, setFilteredReportIds] = useState<string[] | null>(null);
    
    const handleAddReport = () => {
        const latestReport = [...reports].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

        const prefilledSubject = latestReport?.subject || '';
        const initialBranches = (SUBJECT_BRANCH_MAP[prefilledSubject] || []).map(branchName => ({
            branchName,
            status: 'not_set' as const,
            lastLesson: '',
            lessonDifference: '',
            percentage: 0
        }));

        const newReport: SyllabusCoverageReport = {
            id: `scr-${Date.now()}`,
            schoolName: school,
            academicYear: academicYear,
            teacherId: latestReport?.teacherId || '',
            branch: latestReport?.branch || 'main',
            date: new Date().toISOString().split('T')[0],
            semester: latestReport?.semester || semester,
            subject: prefilledSubject,
            grade: '', // Leave grade empty
            branches: initialBranches, // Populate branches based on subject, but leave them empty
            authorId: currentUser?.id,
        };
        setReports(prev => [newReport, ...prev]);
        setFilteredReportIds(null); // Reset filter to show the new report
    };

    const handleUpdateReport = (updatedReport: SyllabusCoverageReport) => {
        setReports(prev => prev.map(r => r.id === updatedReport.id ? updatedReport : r));
    };

    const handleDeleteReport = (reportId: string) => {
        if (window.confirm(t('confirmDelete'))) {
            setReports(prev => prev.filter(r => r.id !== reportId));
        }
    };

    const displayedReports = useMemo(() => {
        if (filteredReportIds) {
            return reports.filter(r => filteredReportIds.includes(r.id));
        }
        return reports;
    }, [reports, filteredReportIds]);
    
    return (
        <div className="p-6 bg-gray-50 rounded-lg shadow-lg space-y-6">
            <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-bold text-center text-primary">{t('syllabusCoverageReport')}</h2>
                 <div className="flex gap-2">
                    <button onClick={() => setShowFilter(true)} className="px-4 py-2 bg-yellow-500 text-white font-bold rounded-lg hover:bg-yellow-600 transition-colors flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" /></svg>
                        فلترة التقارير
                    </button>
                    {filteredReportIds && <button onClick={() => setFilteredReportIds(null)} className="text-sm underline text-blue-600">إظهار الكل</button>}
                    <button onClick={handleAddReport} className="px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-opacity-90 transition-colors">+ {t('addNewSyllabusReport')}</button>
                 </div>
            </div>
           
            {showFilter && (
                <FilterTableModal 
                    reports={reports} 
                    allTeachers={allTeachers} 
                    onClose={() => setShowFilter(false)} 
                    onViewReports={(ids) => {
                        setFilteredReportIds(ids);
                        setShowFilter(false);
                    }}
                />
            )}

            <div className="space-y-6">
                {displayedReports.length > 0 ? (
                    displayedReports.map(report => (
                        <ReportEditor 
                            key={report.id}
                            report={report}
                            onUpdate={handleUpdateReport}
                            onDelete={handleDeleteReport}
                            allTeachers={allTeachers}
                            allReports={reports}
                        />
                    ))
                ) : (
                    <p className="text-center text-gray-500 py-8">{t('noSyllabusCoverageReports')}</p>
                )}
            </div>
        </div>
    );
};

export default SyllabusCoverageManager;
