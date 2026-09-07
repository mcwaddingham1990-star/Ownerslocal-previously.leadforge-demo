import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, setDoc, deleteDoc, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useDomainData } from "../context/DomainDataContext";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import {
  GraduationCap,
  Award,
  BookOpen,
  Search,
  Filter,
  RefreshCw,
  PlusCircle,
  AlertTriangle,
  Play,
  CheckCircle2,
  ChevronRight,
  X,
  Clock,
  HelpCircle,
  FileText,
  Check,
  Sparkles,
  Download,
  Upload,
  User,
  UserCheck,
  ShieldAlert,
  Send,
  Plus,
  Trash2,
  Edit,
  Save,
  Globe,
  Video,
  FileDown,
  FileSpreadsheet,
  Settings,
  Bell,
  CheckSquare
} from "lucide-react";
import { DocumentItem } from "./DocumentsPage";
import { SchedulingEvent } from "./SchedulingPage";

// Types matching the Training requirements
export interface Lesson {
  id: string;
  title: string;
  content: string;
  videos?: string[];
  documents?: string[];
  images?: string[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: "multiple_choice" | "true_false" | "image_question" | "video_question" | "short_answer";
  options?: string[];
  correctAnswer: string;
  mediaUrl?: string; // For image/video questions
}

export interface Course {
  id: string;
  name: string;
  category: "Safety" | "HVAC" | "Electrical" | "Plumbing" | "Office" | "CDL" | "Onboarding" | "Custom";
  description: string;
  thumbnail: string; // Emoji or Icon name
  estimatedTime: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  requiredRoles: string[];
  passingScore: number;
  lessons: Lesson[];
  quizzes: QuizQuestion[];
  isFavorite?: boolean;
}

export interface Certification {
  id: string;
  name: string;
  type: "OSHA" | "EPA" | "Electrical" | "HVAC" | "CDL" | "Insurance" | "Custom";
  status: "Active" | "Expired" | "Expiring Soon";
  issueDate: string;
  expirationDate: string;
}

export interface EmployeeTrainingProfile {
  employeeName: string;
  role: string;
  department: "Field" | "Office" | "Dispatch" | "Management";
  assignedCourseIds: string[];
  completedCourseIds: string[];
  courseProgress: Record<string, number>; // courseId -> completion %
  currentLessonIndex: Record<string, number>; // courseId -> lesson index
  quizScores: Record<string, number[]>; // courseId -> list of quiz scores
  certifications: Certification[];
  trainingHours: number;
}

export const TrainingPage: React.FC = () => {
  const { loggedInUser, simulatedRole } = useAuth();
  const activeRole = simulatedRole || loggedInUser?.role || "Owner";
  const {
    employees,
    recentRoster,
    documents,
    setDocuments,
    schedulingEvents: events,
    setSchedulingEvents: setEvents
  } = useDomainData();
  const {
    openPlaceholderPage: onOpenPlaceholder,
    takeSnapshot: onTakeSnapshot,
    openPageAIAnalysis: onOpenAIAnalysis,
    navigateToScreen: onNavigateToScreen,
    logOperationalEvent
  } = useNavTelemetry();
  // State
  const businessId = loggedInUser?.isEmployee ? loggedInUser.businessEmail : loggedInUser?.email;

  const [courses, _setCourses] = useState<Course[]>([]);
  const [profiles, _setProfiles] = useState<EmployeeTrainingProfile[]>([]);
  const courseCacheKey = businessId ? `ownerslocal_courses:${businessId.toLowerCase()}` : "";
  const profileCacheKey = businessId ? `ownerslocal_training_profiles:${businessId.toLowerCase()}` : "";

  const rosterCandidates = useMemo(() => {
    const byName = new Map<string, { id: string; name: string; role: string }>();
    employees.forEach(employee => {
      const name = `${employee.firstName} ${employee.lastName}`.trim();
      if (name) byName.set(name.toLowerCase(), { id: employee.email || employee.id, name, role: employee.role });
    });
    recentRoster.forEach(entry => {
      const name = String(entry.name || "").trim();
      if (name && !byName.has(name.toLowerCase())) {
        byName.set(name.toLowerCase(), { id: entry.id || entry.code || name, name, role: entry.role || "Employee" });
      }
    });
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, recentRoster]);

  // Real-time synchronization helper for courses
  const syncCoursesToFirestore = async (oldArray: Course[], newArray: Course[], bid: string) => {
    const scopedId = (id: string) => `${bid.toLowerCase().replace(/[^a-z0-9]/g, "_")}__${id}`;
    const oldMap = new Map(oldArray.map(item => [item.id, item]));
    for (const item of newArray) {
      const oldItem = oldMap.get(item.id);
      if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
        try {
          await setDoc(doc(db, "courses", scopedId(item.id)), {
            ...item,
            businessId: bid,
            updatedAt: new Date().toISOString()
          });
        } catch (err) {
          console.error("Error saving course:", err);
        }
      }
    }
    const newSet = new Set(newArray.map(item => item.id));
    for (const item of oldArray) {
      if (!newSet.has(item.id)) {
        try {
          await deleteDoc(doc(db, "courses", scopedId(item.id)));
        } catch (err) {
          console.error("Error deleting course:", err);
        }
      }
    }
  };

  const setCourses = (value: React.SetStateAction<Course[]>) => {
    _setCourses((prev) => {
      const nextList = typeof value === "function" ? (value as Function)(prev) : value;
      if (businessId) {
        syncCoursesToFirestore(prev, nextList, businessId);
        localStorage.setItem(courseCacheKey, JSON.stringify(nextList));
      }
      return nextList;
    });
  };

  // Real-time synchronization helper for training profiles
  const syncProfilesToFirestore = async (oldArray: EmployeeTrainingProfile[], newArray: EmployeeTrainingProfile[], bid: string) => {
    const getProfileId = (p: EmployeeTrainingProfile) => p.employeeName.replace(/\s+/g, "_").toLowerCase();
    const scopedId = (id: string) => `${bid.toLowerCase().replace(/[^a-z0-9]/g, "_")}__${id}`;
    const oldMap = new Map(oldArray.map(item => [getProfileId(item), item]));
    for (const item of newArray) {
      const itemKey = getProfileId(item);
      const oldItem = oldMap.get(itemKey);
      if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
        try {
          await setDoc(doc(db, "training_profiles", scopedId(itemKey)), {
            ...item,
            businessId: bid,
            updatedAt: new Date().toISOString()
          });
        } catch (err) {
          console.error("Error saving training profile:", err);
        }
      }
    }
    const newSet = new Set(newArray.map(item => getProfileId(item)));
    for (const item of oldArray) {
      const itemKey = getProfileId(item);
      if (!newSet.has(itemKey)) {
        try {
          await deleteDoc(doc(db, "training_profiles", scopedId(itemKey)));
        } catch (err) {
          console.error("Error deleting training profile:", err);
        }
      }
    }
  };

  const setProfiles = (value: React.SetStateAction<EmployeeTrainingProfile[]>) => {
    _setProfiles((prev) => {
      const nextList = typeof value === "function" ? (value as Function)(prev) : value;
      if (businessId) {
        syncProfilesToFirestore(prev, nextList, businessId);
        localStorage.setItem(profileCacheKey, JSON.stringify(nextList));
      }
      return nextList;
    });
  };

  // Subscribe and seed courses & training profiles from Firestore based on multi-tenant businessId
  useEffect(() => {
    if (!businessId) return;

    const cachedCourses = (() => {
      try { return JSON.parse(localStorage.getItem(courseCacheKey) || "[]") as Course[]; }
      catch { return [] as Course[]; }
    })();
    const cachedProfiles = (() => {
      try { return JSON.parse(localStorage.getItem(profileCacheKey) || "[]") as EmployeeTrainingProfile[]; }
      catch { return [] as EmployeeTrainingProfile[]; }
    })();
    _setCourses(cachedCourses);
    _setProfiles(cachedProfiles);

    // 1. Subscribe to courses (starts empty for every new account)
    const qCourses = query(collection(db, "courses"), where("businessId", "==", businessId));
    const unsubCourses = onSnapshot(qCourses, (snapshot) => {
      const items: Course[] = [];
      snapshot.forEach((docSnap) => {
        const { businessId: _, updatedAt: __, ...courseData } = docSnap.data();
        items.push(courseData as Course);
      });
      const merged = new Map(cachedCourses.map(item => [item.id, item]));
      items.forEach(item => merged.set(item.id, item));
      const next = [...merged.values()];
      _setCourses(next);
      localStorage.setItem(courseCacheKey, JSON.stringify(next));
    }, (error) => console.error("Unable to load course library:", error));

    // 2. Subscribe to profiles (starts empty for every new account)
    const qProfiles = query(collection(db, "training_profiles"), where("businessId", "==", businessId));
    const unsubProfiles = onSnapshot(qProfiles, (snapshot) => {
      const items: EmployeeTrainingProfile[] = [];
      snapshot.forEach((docSnap) => {
        const { businessId: _, updatedAt: __, ...profileData } = docSnap.data();
        items.push(profileData as EmployeeTrainingProfile);
      });
      const byEmployee = new Map(cachedProfiles.map(item => [item.employeeName.toLowerCase(), item]));
      items.forEach(item => byEmployee.set(item.employeeName.toLowerCase(), item));
      const next = [...byEmployee.values()];
      _setProfiles(next);
      localStorage.setItem(profileCacheKey, JSON.stringify(next));
    }, (error) => console.error("Unable to load training assignments:", error));

    return () => {
      unsubCourses();
      unsubProfiles();
    };
  }, [businessId, courseCacheKey, profileCacheKey]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchBy, setSearchBy] = useState<"all" | "employee" | "course" | "certification" | "department" | "role" | "status">("all");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState("All");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("All");
  const [requiredOnlyFilter, setRequiredOnlyFilter] = useState(false);
  const [favoritesOnlyFilter, setFavoritesOnlyFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All"); // All, In progress, Completed, Expired

  // Selections
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedEmployeeName, setSelectedEmployeeName] = useState<string | null>(null);

  // Active training/quiz taking
  const [activeCourseTaking, setActiveCourseTaking] = useState<Course | null>(null);
  const [activeLessonIndex, setActiveLessonIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizGraded, setQuizGraded] = useState(false);
  const [quizScorePct, setQuizScorePct] = useState<number | null>(null);

  // AI Prompt Builder
  const [aiSelectedType, setAiSelectedType] = useState<"lesson" | "quiz" | "policy" | "manual">("lesson");
  const [aiRoleSubject, setAiRoleSubject] = useState("Technician");
  const [aiCustomTopic, setAiCustomTopic] = useState("");
  const [aiWorking, setAiWorking] = useState(false);
  const [aiResponseText, setAiResponseText] = useState("");

  // Modals for admin creation
  const [showCreateCourseModal, setShowCreateCourseModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTargetCourseId, setAssignTargetCourseId] = useState("");
  const [assignTargetEmployeeName, setAssignTargetEmployeeName] = useState("");

  // Course Creator Form
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCategory, setNewCourseCategory] = useState<Course["category"]>("Safety");
  const [newCourseDesc, setNewCourseDesc] = useState("");
  const [newCourseRoles, setNewCourseRoles] = useState<string[]>(["Technician"]);
  const [newCourseTime, setNewCourseTime] = useState("2 hours");
  const [newCourseDifficulty, setNewCourseDifficulty] = useState<Course["difficulty"]>("Beginner");
  const [newCourseLessonTitle, setNewCourseLessonTitle] = useState("");
  const [newCourseLessonContent, setNewCourseLessonContent] = useState("");
  const [newCourseQuizQ, setNewCourseQuizQ] = useState("");
  const [newCourseQuizOptions, setNewCourseQuizOptions] = useState("Option A, Option B, Option C, Option D");
  const [newCourseQuizAns, setNewCourseQuizAns] = useState("Option A");

  // Sync with the same real employee collection used by the Roster page.
  // The legacy `roster` collection only contains invite/onboarding records
  // and can be empty even while real employees already exist.
  useEffect(() => {
    // Add default training profiles for any real employee who doesn't have one.
    rosterCandidates.forEach(employee => {
      const employeeName = employee.name;
      if (!employeeName) return;
      const exists = profiles.some(p => p.employeeName.toLowerCase() === employeeName.toLowerCase());
      if (!exists) {
        // Build auto onboarding training profile
        const dept: EmployeeTrainingProfile["department"] = 
          employee.role === "Office Manager" ? "Office" :
          employee.role === "Dispatcher" ? "Dispatch" : "Field";
        
        // Auto assign based on onboarding rules
        const autoAssigned: string[] = [];
        if (employee.role === "Driver") {
          autoAssigned.push("course_cdl", "course_osha");
        } else if (employee.role === "Technician") {
          autoAssigned.push("course_osha", "course_epa", "course_electric");
        } else if (employee.role === "Office Manager" || employee.role === "Salesperson") {
          autoAssigned.push("course_billing", "course_osha");
        } else {
          autoAssigned.push("course_osha");
        }

        const newProfile: EmployeeTrainingProfile = {
          employeeName,
          role: employee.role,
          department: dept,
          assignedCourseIds: autoAssigned,
          completedCourseIds: [],
          courseProgress: autoAssigned.reduce((acc, cId) => ({ ...acc, [cId]: 0 }), {}),
          currentLessonIndex: autoAssigned.reduce((acc, cId) => ({ ...acc, [cId]: 0 }), {}),
          quizScores: {},
          certifications: [],
          trainingHours: 0
        };

        setProfiles(prev => [...prev, newProfile]);
        if (logOperationalEvent) {
          logOperationalEvent("Training Core", `Auto-assigned onboarding curriculum to new employee ${employeeName} (${employee.role})`, "🎓");
        }
      }
    });
  }, [rosterCandidates, profiles]);

  // Is Admin/Manager Role?
  const hasAdminRights = ["Owner", "General Manager", "Office Manager", "HR Manager", "Safety Manager", "Training Manager"].includes(activeRole);

  // Helper functions
  const triggerNotification = (desc: string) => {
    if (logOperationalEvent) {
      logOperationalEvent("Training", desc, "🎓");
    }
  };

  // Assign a course
  const handleAssignCourse = (courseId: string, empName: string) => {
    if (!courseId || !empName) return;
    setProfiles(prev => prev.map(p => {
      if (p.employeeName === empName) {
        if (p.assignedCourseIds.includes(courseId)) {
          triggerNotification(`${empName} is already assigned to this course.`);
          return p;
        }
        const updatedAssigned = [...p.assignedCourseIds, courseId];
        const updatedProgress = { ...p.courseProgress, [courseId]: 0 };
        const updatedLesson = { ...p.currentLessonIndex, [courseId]: 0 };
        triggerNotification(`Assigned Course to ${empName} successfully!`);
        return {
          ...p,
          assignedCourseIds: updatedAssigned,
          courseProgress: updatedProgress,
          currentLessonIndex: updatedLesson
        };
      }
      return p;
    }));
    setShowAssignModal(false);
  };

  // Complete a quiz & potentially generate certificate
  const handleGradeQuiz = (course: Course) => {
    let correctCount = 0;
    course.quizzes.forEach(q => {
      if (quizAnswers[q.id] === q.correctAnswer) {
        correctCount++;
      }
    });

    const totalQuestions = course.quizzes.length;
    const scorePct = Math.round((correctCount / totalQuestions) * 100);
    setQuizScorePct(scorePct);
    setQuizGraded(true);

    const passed = scorePct >= course.passingScore;

    // Update Profile state
    setProfiles(prev => prev.map(p => {
      // Find matching profile for the current logged-in user
      const targetUser = loggedInUser?.name || "Unknown User";
      if (p.employeeName === targetUser) {
        const scores = p.quizScores[course.id] ? [...p.quizScores[course.id], scorePct] : [scorePct];
        const newQuizScores = { ...p.quizScores, [course.id]: scores };
        
        let completedIds = p.completedCourseIds;
        let progress = p.courseProgress;

        if (passed) {
          if (!completedIds.includes(course.id)) {
            completedIds = [...completedIds, course.id];
          }
          progress = { ...progress, [course.id]: 100 };
          
          // GENERATE CERTIFICATE
          const certType = 
            course.category === "Safety" ? "OSHA" as const :
            course.category === "HVAC" ? "EPA" as const :
            course.category === "Electrical" ? "Electrical" as const :
            course.category === "CDL" ? "CDL" as const : "Custom" as const;
            
          const hasCert = p.certifications.some(c => c.name.includes(course.name));
          let updatedCerts = p.certifications;

          if (!hasCert) {
            const newCert: Certification = {
              id: `cert_${Math.floor(1000 + Math.random() * 9000)}`,
              name: `${course.name} Certificate`,
              type: certType,
              status: "Active",
              issueDate: new Date().toISOString().split("T")[0],
              expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] // 1 year
            };
            updatedCerts = [...updatedCerts, newCert];

            // ADD CERTIFICATE TO SYSTEM DOCUMENTS MODULE (Cross-module sync)
            const docId = `doc_cert_${Math.floor(10000 + Math.random() * 90000)}`;
            const newDoc: DocumentItem = {
              id: docId,
              name: `Official Certificate - ${course.name} (${targetUser}).pdf`,
              customer: "Internal Operations",
              employee: targetUser,
              vendor: "OwnersLOCAL Academy",
              job: "Professional Certification",
              type: "Training",
              uploadedBy: "System Onboarding",
              date: new Date().toISOString().split("T")[0],
              size: "1.4 MB",
              status: "Signed",
              isFavorite: true,
              isArchived: false,
              notes: "Verified certification of completion logged via interactive Training Academy.",
              tags: ["Certification", "Training", course.category],
              estimateId: "",
              invoiceId: "",
              lastModified: new Date().toISOString().split("T")[0]
            };
            
            // Appending to shared documents
            setTimeout(() => {
              setDocuments(prevDocs => [newDoc, ...prevDocs]);
            }, 50);

            // Log Scheduling Event for review if required
            const scheduleId = `evt_training_${Math.floor(10000 + Math.random() * 90000)}`;
            const newSched: SchedulingEvent = {
              id: scheduleId,
              eventType: "Training",
              date: new Date().toISOString().split("T")[0],
              startTime: "09:00",
              endTime: "11:00",
              customer: "Internal Employee Training",
              assignedEmployee: targetUser,
              priority: "Low",
              notes: `Auto-logged: Completed course ${course.name} with score of ${scorePct}%`,
              status: "Completed"
            };
            
            setTimeout(() => {
              setEvents(prevEvents => [newSched, ...prevEvents]);
            }, 100);

            triggerNotification(`Congratulations! You passed and earned a new certificate. Added to Documents index.`);
          }
          return {
            ...p,
            completedCourseIds: completedIds,
            courseProgress: progress,
            certifications: updatedCerts,
            trainingHours: p.trainingHours + parseFloat(course.estimatedTime.split(" ")[0] || "1.0")
          };
        } else {
          // Failed
          triggerNotification(`Quiz failed. You scored ${scorePct}%. Required passing is ${course.passingScore}%.`);
          return {
            ...p,
            quizScores: newQuizScores
          };
        }
      }
      return p;
    }));
  };

  // AI Create Course Lesson Unit function
  const handleAICreateRequest = () => {
    setAiWorking(true);
    setAiResponseText("");

    setTimeout(() => {
      let result = "";
      if (aiSelectedType === "lesson") {
        result = `### AI Lesson Plan: ${aiRoleSubject} - ${aiCustomTopic || "Advanced Diagnostics"}\n\n**Estimated Duration**: 45 Minutes  \n**Skill Level**: Advanced Operations\n\n#### 1. Core Operating Guidelines\nAlways isolate current relays and check ambient thermocouple outputs prior to deploying repair components. \n\n#### 2. Hazard Mitigations\nEnsure double lock isolation switches are strictly labeled with physical hazard tags.\n\n#### 3. Diagnostic Ledger Log\nVerify electrical pressure values map exactly to local county parameters.`;
      } else if (aiSelectedType === "quiz") {
        result = `### AI Generated Quiz: ${aiRoleSubject} Onboarding\n\n#### Question 1 (Multiple Choice)\nWhich safety tool must be verified before performing diagnostic isolation?\n- [ ] Visual verification of tags\n- [ ] Multi-point voltage meter\n- [ ] Standard pliers\n- [ ] Customer confirmation\n*Correct Answer: Multi-point voltage meter*\n\n#### Question 2 (True/False)\nIt is fully acceptable to bypass breaker systems for diagnostic triage under 5 minutes.\n- [ ] True\n- [ ] False\n*Correct Answer: False*`;
      } else if (aiSelectedType === "policy") {
        result = `### Official Corporate Policy: OwnersLOCAL ${aiRoleSubject} Code of Conduct\n\n**Published**: July 2026\n**Regulatory Scope**: Nationwide Administrative Compliance\n\n1. All dispatch lines must receive direct client confirmations before technicians mobilize.\n2. Field teams are strictly required to log GPS vehicle snapshots for all invoicing compliance audits.\n3. Fuel vouchers require supervisor timestamps within 24 hours of expenditure.`;
      } else {
        result = `### AI Operations Manual: ${aiRoleSubject} Equipment Troubleshooting Guide\n\n**Topic**: ${aiCustomTopic || "High Pressure Fluid Pumps"}\n\n#### Section A: Safe Purging Protocols\nAlways exhaust high static lines slowly through secondary exhaust valves to prevent liquid backflow issues.\n\n#### Section B: Pressure Troubleshooting\nVerify pump head casing is running cool (<140°F) before testing flow thresholds. Check the inlet pipe gasket for structural stress cracks.`;
      }
      
      setAiResponseText(result);
      setAiWorking(false);
      triggerNotification(`AI successfully generated specialized content for ${aiRoleSubject}!`);
    }, 1500);
  };

  // Convert AI generated lesson to a real course lesson
  const handleAddAILessonToCourse = (courseId: string) => {
    if (!aiResponseText) return;
    setCourses(prev => prev.map(c => {
      if (c.id === courseId) {
        const newLessonItem: Lesson = {
          id: `lesson_${Math.floor(Math.random() * 1000)}`,
          title: `AI Generated unit - ${aiCustomTopic || "Specialized Tech Details"}`,
          content: aiResponseText
        };
        triggerNotification(`Appended AI generated lesson unit to course: ${c.name}`);
        return {
          ...c,
          lessons: [...c.lessons, newLessonItem]
        };
      }
      return c;
    }));
  };

  // Course Creator Execution
  const handleCreateCourseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim() || !newCourseDesc.trim()) {
      triggerNotification("Please provide a name and description.");
      return;
    }

    const defaultLesson: Lesson = {
      id: `lesson_init_${Math.floor(Math.random() * 1000)}`,
      title: newCourseLessonTitle.trim() || "Introduction unit",
      content: newCourseLessonContent.trim() || "Core educational content under development."
    };

    const defaultQuiz: QuizQuestion = {
      id: `quiz_init_${Math.floor(Math.random() * 1000)}`,
      question: newCourseQuizQ.trim() || "What is the key objective of this protocol?",
      type: "multiple_choice",
      options: newCourseQuizOptions.split(",").map(o => o.trim()),
      correctAnswer: newCourseQuizAns.trim()
    };

    const newCourseObj: Course = {
      id: `course_${Math.floor(1000 + Math.random() * 9000)}`,
      name: newCourseName,
      category: newCourseCategory,
      description: newCourseDesc,
      thumbnail: newCourseCategory === "Safety" ? "🚧" :
                 newCourseCategory === "HVAC" ? "❄️" :
                 newCourseCategory === "Electrical" ? "⚡" :
                 newCourseCategory === "CDL" ? "🚛" : "📚",
      estimatedTime: newCourseTime,
      difficulty: newCourseDifficulty,
      requiredRoles: newCourseRoles,
      passingScore: 80,
      lessons: [defaultLesson],
      quizzes: [defaultQuiz]
    };

    setCourses(prev => [newCourseObj, ...prev]);
    setShowCreateCourseModal(false);
    triggerNotification(`Created Course '${newCourseName}' & mapped onboarding prerequisites!`);

    // Reset forms
    setNewCourseName("");
    setNewCourseDesc("");
    setNewCourseLessonTitle("");
    setNewCourseLessonContent("");
    setNewCourseQuizQ("");
  };

  // Toggle roles toggle checkbox
  const toggleCourseCreatorRole = (role: string) => {
    if (newCourseRoles.includes(role)) {
      setNewCourseRoles(prev => prev.filter(r => r !== role));
    } else {
      setNewCourseRoles(prev => [...prev, role]);
    }
  };

  // Metrics calculators
  const totalCoursesCount = courses.length;
  
  const employeesInProgressCount = profiles.filter(p => 
    Object.values(p.courseProgress).some((progress) => (progress as number) > 0 && (progress as number) < 100)
  ).length;

  const totalCertificationsCount = profiles.reduce((acc, p) => 
    acc + p.certifications.filter(c => c.status === "Active").length, 0
  );

  const expiredCertsCount = profiles.reduce((acc, p) => 
    acc + p.certifications.filter(c => c.status === "Expired").length, 0
  );

  const averageCompletionPct = profiles.length === 0 ? 0 : Math.round(
    profiles.reduce((acc, p) => {
      const progValues = Object.values(p.courseProgress) as number[];
      if (progValues.length === 0) return acc + 100; // default empty to 100
      const sum = progValues.reduce((s, v) => s + v, 0);
      return acc + (sum / progValues.length);
    }, 0) / profiles.length
  );

  // Selected Profile stats helper
  const activeEmployeeProfile = profiles.find(p => p.employeeName === selectedEmployeeName);

  // Filtered courses
  const filteredCourses = courses.filter(c => {
    // Search
    const query = searchQuery.toLowerCase();
    const matchesSearch = searchQuery === "" || (
      searchBy === "all" ? (
        c.name.toLowerCase().includes(query) ||
        c.category.toLowerCase().includes(query) ||
        c.description.toLowerCase().includes(query)
      ) : searchBy === "course" ? (
        c.name.toLowerCase().includes(query)
      ) : searchBy === "certification" ? (
        c.name.toLowerCase().includes(query) || c.category.toLowerCase().includes(query)
      ) : searchBy === "role" ? (
        c.requiredRoles.some(r => r.toLowerCase().includes(query))
      ) : true
    );

    // Filters
    const matchesRole = selectedRoleFilter === "All" || c.requiredRoles.includes(selectedRoleFilter);
    const matchesCategory = selectedDeptFilter === "All" || c.category === selectedDeptFilter;
    const matchesFavorite = !favoritesOnlyFilter || c.isFavorite;

    return matchesSearch && matchesRole && matchesCategory && matchesFavorite;
  });

  return (
    <div className="bg-[#C7E3FB] rounded-3xl p-6 border border-[#A9CDEE] shadow-sm space-y-6 animate-fade-in text-left text-slate-800">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#A9CDEE] pb-5 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎓</span>
            <h2 className="text-base font-sans font-extrabold text-[#342D7E] uppercase tracking-wider">
              Training Center & Academy
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-sans font-semibold">
            Enterprise safety curriculum, role-based onboarding, and AI lesson planner.
          </p>
        </div>

        {/* TOP LEVEL BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          {hasAdminRights && (
            <>
              <button
                onClick={() => setShowAssignModal(true)}
                className="px-3.5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
              >
                <UserCheck className="w-4 h-4" /> Assign Training
              </button>
              
              <button
                onClick={() => setShowCreateCourseModal(true)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
              >
                <PlusCircle className="w-4 h-4" /> Create Course
              </button>
            </>
          )}

          <button
            onClick={() => {
              // Trigger AI options chatbot drawer on server state
              if (onOpenAIAnalysis) {
                onOpenAIAnalysis("training", "Training Academy", "Generate mechanical safety onboarding lessons");
              }
            }}
            className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
          >
            <Sparkles className="w-4 h-4 text-amber-300" /> AI Create Lesson
          </button>

          <button
            onClick={() => {
              triggerNotification("Training registers synchronized with central CRM ledger.");
            }}
            className="p-2.5 bg-[#E3F3FF] hover:bg-[#BDDDF8] border border-[#A9CDEE] text-[#4A9BFF] hover:text-[#342D7E] rounded-xl transition-all cursor-pointer shadow-sm"
            title="Sync Ledger"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <div className="flex gap-1.5">
            <button
              onClick={() => {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ courses, profiles }));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", "ownerslocal_training_backup.json");
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
                triggerNotification("Exported corporate safety ledger.");
              }}
              className="p-2 bg-white hover:bg-slate-50 border border-[#A9CDEE] rounded-xl text-slate-500 hover:text-[#342D7E] transition-all cursor-pointer"
              title="Export Ledger"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                triggerNotification("Ready to import external SCORM or OSHA registry standard files.");
              }}
              className="p-2 bg-white hover:bg-slate-50 border border-[#A9CDEE] rounded-xl text-slate-500 hover:text-[#342D7E] transition-all cursor-pointer"
              title="Import Files"
            >
              <Upload className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
        <div className="bg-[#E3F3FF] border border-[#A9CDEE] p-4 rounded-2xl flex flex-col justify-between shadow-xs">
          <span className="text-[10px] text-slate-500 font-sans font-bold uppercase tracking-wider">Courses</span>
          <span className="text-xl font-black text-[#342D7E] mt-1">{totalCoursesCount}</span>
        </div>
        
        <div className="bg-[#E3F3FF] border border-[#A9CDEE] p-4 rounded-2xl flex flex-col justify-between shadow-xs">
          <span className="text-[10px] text-slate-500 font-sans font-bold uppercase tracking-wider">In Progress</span>
          <span className="text-xl font-black text-amber-600 mt-1">{employeesInProgressCount}</span>
        </div>

        <div className="bg-[#E3F3FF] border border-[#A9CDEE] p-4 rounded-2xl flex flex-col justify-between shadow-xs">
          <span className="text-[10px] text-slate-500 font-sans font-bold uppercase tracking-wider">Completed Today</span>
          <span className="text-xl font-black text-emerald-600 mt-1">
            {profiles.filter(p => p.completedCourseIds.length > 0).length}
          </span>
        </div>

        <div className="bg-[#E3F3FF] border border-[#A9CDEE] p-4 rounded-2xl flex flex-col justify-between shadow-xs">
          <span className="text-[10px] text-slate-500 font-sans font-bold uppercase tracking-wider">Certifications</span>
          <span className="text-xl font-black text-[#342D7E] mt-1">{totalCertificationsCount}</span>
        </div>

        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex flex-col justify-between shadow-xs">
          <span className="text-[10px] text-rose-500 font-sans font-bold uppercase tracking-wider">Expired Certs</span>
          <span className="text-xl font-black text-rose-600 mt-1">{expiredCertsCount}</span>
        </div>

        <div className="bg-[#E3F3FF] border border-[#A9CDEE] p-4 rounded-2xl flex flex-col justify-between shadow-xs">
          <span className="text-[10px] text-slate-500 font-sans font-bold uppercase tracking-wider">Required Training</span>
          <span className="text-xl font-black text-indigo-700 mt-1">
            {courses.filter(c => c.requiredRoles.length > 0).length}
          </span>
        </div>

        <div className="bg-[#E3F3FF] border border-[#A9CDEE] p-4 rounded-2xl flex flex-col justify-between shadow-xs">
          <span className="text-[10px] text-slate-500 font-sans font-bold uppercase tracking-wider">Avg Completion</span>
          <span className="text-xl font-black text-emerald-700 mt-1">{averageCompletionPct}%</span>
        </div>
      </div>

      {/* SEARCH AND FILTER CRITERIA */}
      <div className="bg-[#E3F3FF] p-4 rounded-2xl border border-[#A9CDEE] grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            type="text"
            placeholder="Search keyword..."
            className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl pl-9 pr-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#4A9BFF] text-slate-700"
          />
        </div>

        {/* Search By Select */}
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-slate-400 font-bold uppercase whitespace-nowrap">By:</label>
          <select
            value={searchBy}
            onChange={(e: any) => setSearchBy(e.target.value)}
            className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-2 py-2 text-xs font-semibold focus:outline-none cursor-pointer"
          >
            <option value="all">All Fields</option>
            <option value="employee">Employee</option>
            <option value="course">Course Name</option>
            <option value="certification">Certification</option>
            <option value="role">Role Prerequisite</option>
          </select>
        </div>

        {/* Category/Dept Filter */}
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-slate-400 font-bold uppercase whitespace-nowrap">Dept/Category:</label>
          <select
            value={selectedDeptFilter}
            onChange={(e) => setSelectedDeptFilter(e.target.value)}
            className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-2 py-2 text-xs font-semibold focus:outline-none cursor-pointer"
          >
            <option value="All">All Categories</option>
            <option value="Safety">Safety Standards</option>
            <option value="HVAC">HVAC Technology</option>
            <option value="Electrical">Electrical Standards</option>
            <option value="CDL">CDL / Drivers</option>
            <option value="Office">Office Operations</option>
            <option value="Onboarding">Onboarding Curriculum</option>
          </select>
        </div>

        {/* Extra toggles */}
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={() => setFavoritesOnlyFilter(!favoritesOnlyFilter)}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all border flex items-center gap-1 cursor-pointer ${
              favoritesOnlyFilter 
                ? "bg-[#342D7E] text-white border-[#342D7E]" 
                : "bg-white text-slate-600 border-[#A9CDEE]"
            }`}
          >
            ★ Favorites
          </button>
          
          <button
            onClick={() => {
              setSearchQuery("");
              setSelectedDeptFilter("All");
              setSelectedRoleFilter("All");
              setFavoritesOnlyFilter(false);
              setStatusFilter("All");
              triggerNotification("All dashboard training filters cleared.");
            }}
            className="p-2 bg-[#E3F3FF] hover:bg-[#BDDDF8] border border-[#A9CDEE] rounded-xl text-slate-500 transition-colors cursor-pointer"
            title="Reset Filters"
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* CORE SPLIT GRID: LEFT = LIBRARY, RIGHT = EMPLOYEES & COMPLIANCE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* COURSE LIBRARY - LEFT PANEL (7 columns) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between border-b border-[#A9CDEE] pb-2">
            <h3 className="text-xs font-black uppercase text-[#342D7E] tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#4A9BFF]" /> Course Library ({filteredCourses.length})
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">Click course to inspect units & syllabus</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCourses.length === 0 ? (
              <div className="col-span-2 text-center p-8 bg-[#E3F3FF] border border-dashed border-[#A9CDEE] rounded-2xl text-slate-500 text-xs font-semibold">
                No courses matched the active filters.
              </div>
            ) : (
              filteredCourses.map(course => {
                // Find simulated completion %
                const userProfile = profiles.find(p => p.employeeName === (loggedInUser?.name || "Unknown User"));
                const progress = userProfile?.courseProgress[course.id] || 0;
                const isRequired = course.requiredRoles.includes(activeRole || loggedInUser?.role || "Owner");

                return (
                  <div
                    key={course.id}
                    onClick={() => {
                      setSelectedCourse(course);
                      setSelectedEmployeeName(null); // Deselect employee to focus on course
                    }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer text-left flex flex-col justify-between gap-4 h-full relative overflow-hidden shadow-xs hover:shadow-md ${
                      selectedCourse?.id === course.id
                        ? "bg-white border-[#342D7E]"
                        : "bg-[#E3F3FF] hover:bg-[#E3F3FF]/80 border-[#A9CDEE]"
                    }`}
                  >
                    {/* Badge */}
                    {isRequired && (
                      <span className="absolute top-3 right-3 px-2 py-0.5 bg-[#342D7E] text-white text-[9px] font-bold rounded-lg uppercase tracking-wider">
                        Required
                      </span>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl select-none">{course.thumbnail}</span>
                        <div>
                          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 bg-white/60 border border-[#A9CDEE]/50 px-1.5 py-0.5 rounded-md">
                            {course.category}
                          </span>
                          <h4 className="text-xs font-black text-slate-800 leading-tight mt-1 uppercase tracking-wider">
                            {course.name}
                          </h4>
                        </div>
                      </div>
                      
                      <p className="text-[11px] text-slate-500 font-sans leading-normal font-medium mt-1 line-clamp-2">
                        {course.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[#A9CDEE]/40 space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400">
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {course.estimatedTime}</span>
                        <span className="capitalize">{course.difficulty}</span>
                      </div>

                      {/* Progress Bar */}
                      <div>
                        <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 mb-1">
                          <span>YOUR PROGRESS</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="w-full bg-slate-200/50 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-[#4A9BFF] h-1.5 rounded-full transition-all duration-300" 
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ACTIVE COURSE / LESSON TAKING VIEW IF OPENED */}
          {activeCourseTaking && (
            <div className="bg-white rounded-2xl p-5 border border-[#342D7E] shadow-md space-y-4 animate-fade-in relative">
              <button
                onClick={() => setActiveCourseTaking(null)}
                className="absolute top-4 right-4 w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-[#342D7E] transition-all cursor-pointer font-bold border border-slate-200"
              >
                ✕
              </button>

              <div className="border-b pb-3 text-left">
                <span className="text-[10px] font-black uppercase text-[#4A9BFF] tracking-wider">{activeCourseTaking.category} Series</span>
                <h3 className="text-sm font-black text-[#342D7E] uppercase mt-0.5">{activeCourseTaking.name}</h3>
                <p className="text-[11px] text-slate-400 font-sans font-semibold mt-1">
                  Active Lesson Unit {activeLessonIndex + 1} of {activeCourseTaking.lessons.length}
                </p>
              </div>

              {/* Lesson Unit display */}
              {activeCourseTaking.lessons[activeLessonIndex] ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-[#4A9BFF]" />
                    {activeCourseTaking.lessons[activeLessonIndex].title}
                  </h4>
                  
                  {/* Markdown Simulated Text Content */}
                  <div className="text-xs text-slate-600 font-sans font-semibold leading-relaxed space-y-2 whitespace-pre-line bg-white p-3.5 rounded-lg border border-slate-100">
                    {activeCourseTaking.lessons[activeLessonIndex].content}
                  </div>

                  {/* Supporting Videos/Docs attachments panel */}
                  {(activeCourseTaking.lessons[activeLessonIndex].videos || activeCourseTaking.lessons[activeLessonIndex].documents) && (
                    <div className="bg-[#E3F3FF] p-3 rounded-xl border border-[#A9CDEE] grid grid-cols-1 md:grid-cols-2 gap-3 text-[10.5px]">
                      {activeCourseTaking.lessons[activeLessonIndex].videos && (
                        <div className="flex items-center gap-2 font-bold text-slate-600">
                          <Video className="w-4 h-4 text-[#4A9BFF]" />
                          <span>Simulated Video Attached: <a href="#player" className="text-blue-600 hover:underline">{activeCourseTaking.lessons[activeLessonIndex].videos?.[0].split('/').pop()}</a></span>
                        </div>
                      )}
                      {activeCourseTaking.lessons[activeLessonIndex].documents && (
                        <div className="flex items-center gap-2 font-bold text-slate-600">
                          <FileDown className="w-4 h-4 text-emerald-600" />
                          <span>Regulatory Guidebook: <a href="#download" className="text-emerald-600 hover:underline">{activeCourseTaking.lessons[activeLessonIndex].documents?.[0]}</a></span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs">
                  Error loading lesson unit index.
                </div>
              )}

              {/* Lesson Nav Controls */}
              <div className="flex justify-between items-center pt-2">
                <button
                  disabled={activeLessonIndex === 0}
                  onClick={() => {
                    setActiveLessonIndex(prev => prev - 1);
                    setQuizGraded(false);
                  }}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-300 flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                >
                  ◀ Previous Lesson
                </button>

                {activeLessonIndex < activeCourseTaking.lessons.length - 1 ? (
                  <button
                    onClick={() => {
                      setActiveLessonIndex(prev => prev + 1);
                      setQuizGraded(false);
                    }}
                    className="px-3.5 py-2 bg-[#4A9BFF] hover:bg-[#3583E6] text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                  >
                    Next Lesson Unit ▶
                  </button>
                ) : (
                  // Quiz phase
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-3 w-full mt-2">
                    <h4 className="text-xs font-black text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                      <HelpCircle className="w-4 h-4" /> Integrated Knowledge Assessment
                    </h4>
                    <p className="text-[11px] text-slate-600 font-sans font-medium">
                      You have reviewed all material units. Take the certification exam below to complete your onboarding profile. Passing Score: <strong>{activeCourseTaking.passingScore}%</strong>
                    </p>

                    {/* Quiz Questions render */}
                    <div className="space-y-4 pt-2">
                      {activeCourseTaking.quizzes.map((q, qIdx) => (
                        <div key={q.id} className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-2 text-left">
                          <p className="text-xs font-extrabold text-slate-800 font-sans leading-relaxed">
                            {qIdx + 1}. {q.question}
                          </p>

                          {q.type === "true_false" || q.type === "multiple_choice" ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {q.options?.map((opt, oIdx) => (
                                <label
                                  key={oIdx}
                                  className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-sans font-semibold cursor-pointer hover:bg-slate-50 transition-colors ${
                                    quizAnswers[q.id] === opt 
                                      ? "bg-[#E3F3FF] border-[#4A9BFF] text-[#342D7E]" 
                                      : "bg-white border-slate-200"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`q_${q.id}`}
                                    value={opt}
                                    checked={quizAnswers[q.id] === opt}
                                    onChange={(e) => setQuizAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                    className="accent-[#4A9BFF]"
                                    disabled={quizGraded}
                                  />
                                  <span>{opt}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <input
                              type="text"
                              disabled={quizGraded}
                              value={quizAnswers[q.id] || ""}
                              onChange={(e) => setQuizAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                              placeholder="Write short answer here..."
                              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-semibold"
                            />
                          )}
                        </div>
                      ))}

                      {quizGraded && quizScorePct !== null && (
                        <div className={`p-4 rounded-xl border text-xs ${
                          quizScorePct >= activeCourseTaking.passingScore
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : "bg-rose-50 border-rose-200 text-rose-800"
                        }`}>
                          <h5 className="font-extrabold uppercase tracking-wide text-xs">
                            {quizScorePct >= activeCourseTaking.passingScore ? "✓ Exam Passed!" : "✗ Exam Failed"}
                          </h5>
                          <p className="mt-1 font-semibold">
                            You scored <strong>{quizScorePct}%</strong>. Required passing benchmark: {activeCourseTaking.passingScore}%.
                          </p>
                        </div>
                      )}

                      {!quizGraded ? (
                        <button
                          onClick={() => handleGradeQuiz(activeCourseTaking)}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl cursor-pointer text-center uppercase tracking-wider"
                        >
                          Submit Quiz Answers & Grade Exam
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setQuizAnswers({});
                              setQuizGraded(false);
                              setQuizScorePct(null);
                            }}
                            className="flex-1 py-2 bg-[#E3F3FF] border border-[#A9CDEE] text-[#4A9BFF] hover:text-[#342D7E] text-xs font-black rounded-xl cursor-pointer text-center uppercase"
                          >
                            Retake Quiz
                          </button>
                          <button
                            onClick={() => setActiveCourseTaking(null)}
                            className="flex-1 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-black rounded-xl cursor-pointer text-center uppercase"
                          >
                            Close Assessment
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* COURSE DETAILS PREVIEW MODULE */}
          {selectedCourse && !activeCourseTaking && (
            <div className="bg-white rounded-2xl p-5 border border-[#A9CDEE] shadow-sm space-y-4 animate-fade-in relative text-left">
              <button
                onClick={() => setSelectedCourse(null)}
                className="absolute top-4 right-4 w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 cursor-pointer border border-slate-200"
              >
                ✕
              </button>

              <div className="flex items-center gap-3">
                <span className="text-3xl select-none">{selectedCourse.thumbnail}</span>
                <div>
                  <span className="text-[9px] font-black uppercase text-[#4A9BFF] tracking-wider bg-[#E3F3FF] border border-[#A9CDEE]/50 px-2 py-0.5 rounded-lg">
                    {selectedCourse.category}
                  </span>
                  <h3 className="text-sm font-black text-slate-800 uppercase mt-1 leading-tight">
                    {selectedCourse.name}
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 bg-[#F5FAFF] p-3 rounded-xl border border-[#A9CDEE]/40 text-center text-[10.5px]">
                <div className="p-2 bg-white rounded-lg border border-slate-100">
                  <p className="text-slate-400 font-bold uppercase text-[8px]">Estimated Duration</p>
                  <p className="font-extrabold text-[#342D7E] mt-0.5">{selectedCourse.estimatedTime}</p>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-100">
                  <p className="text-slate-400 font-bold uppercase text-[8px]">Difficulty Level</p>
                  <p className="font-extrabold text-[#342D7E] mt-0.5 capitalize">{selectedCourse.difficulty}</p>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-100">
                  <p className="text-slate-400 font-bold uppercase text-[8px]">Lessons / Units</p>
                  <p className="font-extrabold text-[#342D7E] mt-0.5">{selectedCourse.lessons.length} Modules</p>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-100">
                  <p className="text-slate-400 font-bold uppercase text-[8px]">Passing Benchmark</p>
                  <p className="font-extrabold text-[#342D7E] mt-0.5">{selectedCourse.passingScore}% Correct</p>
                </div>
              </div>

              <div className="space-y-1">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Syllabus Overview</h4>
                <p className="text-xs text-slate-600 font-sans leading-relaxed font-semibold">
                  {selectedCourse.description}
                </p>
              </div>

              {/* Lesson Items list */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Educational Syllabus ({selectedCourse.lessons.length} Units)</h4>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                  {selectedCourse.lessons.map((les, idx) => (
                    <div key={les.id} className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-between text-xs text-slate-700 font-bold">
                      <span className="flex items-center gap-2">
                        <span className="w-5 h-5 bg-[#E3F3FF] text-[#4A9BFF] rounded-full flex items-center justify-center text-[10px] font-mono">
                          {idx + 1}
                        </span>
                        <span>{les.title}</span>
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono tracking-wider">Unit • {les.videos ? "Video included" : "Text study"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions panel */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setActiveCourseTaking(selectedCourse);
                    setActiveLessonIndex(0);
                    setQuizAnswers({});
                    setQuizGraded(false);
                    setQuizScorePct(null);
                    triggerNotification(`Started training course: ${selectedCourse.name}`);
                  }}
                  className="px-4 py-2.5 bg-[#4A9BFF] hover:bg-[#3583E6] text-white text-xs font-black rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm uppercase tracking-wider"
                >
                  <Play className="w-4 h-4 fill-current" /> Start Course Study
                </button>

                {hasAdminRights && (
                  <>
                    <button
                      onClick={() => {
                        setAssignTargetCourseId(selectedCourse.id);
                        setShowAssignModal(true);
                      }}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" /> Assign to Tech
                    </button>

                    <button
                      onClick={() => {
                        // Simulate deleting the course
                        setCourses(prev => prev.filter(c => c.id !== selectedCourse.id));
                        setSelectedCourse(null);
                        triggerNotification("Deleted selected training course.");
                      }}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* AI ASSISTANCE INTERACTIVE LESSON/QUIZ PLANNER */}
          <div className="bg-[#E3F3FF]/80 p-5 rounded-2xl border border-[#A9CDEE] space-y-4 shadow-sm text-left">
            <div>
              <h4 className="text-xs font-black text-[#342D7E] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" /> AI Classroom Builder & Diagnostic Assistant
              </h4>
              <p className="text-[10.5px] text-slate-500 mt-0.5 leading-normal font-sans font-semibold">
                Generate safety manuals, role-specific onboarding lessons, quizzes, or translations in seconds.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Type Select */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-black">AI Content Template</label>
                <select
                  value={aiSelectedType}
                  onChange={(e: any) => setAiSelectedType(e.target.value)}
                  className="w-full text-xs bg-white border border-[#A9CDEE] rounded-xl px-2 py-2.5 focus:outline-none font-semibold"
                >
                  <option value="lesson">Educational Lesson Unit</option>
                  <option value="quiz">Interactive Quiz Questions</option>
                  <option value="policy">Corporate/Company Policy</option>
                  <option value="manual">Equipment Safety Manual</option>
                </select>
              </div>

              {/* Target Role */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-black">Target Team Role</label>
                <select
                  value={aiRoleSubject}
                  onChange={(e) => setAiRoleSubject(e.target.value)}
                  className="w-full text-xs bg-white border border-[#A9CDEE] rounded-xl px-2 py-2.5 focus:outline-none font-semibold"
                >
                  <option value="Technician">Technician / Specialist</option>
                  <option value="Driver">Driver / CDL Operator</option>
                  <option value="Office Manager">Office Manager / Support</option>
                  <option value="Dispatcher">Dispatcher / Router</option>
                  <option value="Salesperson">Salesperson</option>
                </select>
              </div>

              {/* Custom Topic Input */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-400 font-black">Custom Focus Subject (Optional)</label>
                <input
                  type="text"
                  value={aiCustomTopic}
                  onChange={(e) => setAiCustomTopic(e.target.value)}
                  placeholder="e.g. Leak Detection, GFCI Code"
                  className="w-full text-xs bg-white border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none font-semibold"
                />
              </div>
            </div>

            {/* AI Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleAICreateRequest}
                disabled={aiWorking}
                className="px-3.5 py-2 bg-[#342D7E] hover:bg-[#1E195E] text-white text-xs font-black rounded-xl shadow-sm transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {aiWorking ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" /> Generate AI Content
                  </>
                )}
              </button>

              {aiResponseText && (
                <>
                  <button
                    onClick={() => {
                      setAiResponseText(prev => prev.toUpperCase());
                      triggerNotification("Capitalized AI lesson content.");
                    }}
                    className="px-2.5 py-2 bg-white hover:bg-slate-50 border border-[#A9CDEE] text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Rewrite Formal
                  </button>
                  
                  <button
                    onClick={() => {
                      setAiResponseText(prev => `### RESUMEN EN ESPAÑOL\nEste módulo cubre pautas operativas y de seguridad clave para el personal de OwnersLOCAL.\n\n` + prev);
                      triggerNotification("Translated content summary to Spanish.");
                    }}
                    className="px-2.5 py-2 bg-white hover:bg-slate-50 border border-[#A9CDEE] text-slate-600 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Globe className="w-3.5 h-3.5" /> Translate Summary
                  </button>

                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddAILessonToCourse(e.target.value);
                        e.target.value = "";
                      }
                    }}
                    className="px-2.5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    <option value="">+ Append to Course...</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {/* AI Output box */}
            {aiResponseText && (
              <div className="p-4 bg-white rounded-xl border border-dashed border-[#A9CDEE] text-xs font-sans text-slate-700 leading-relaxed font-semibold whitespace-pre-wrap relative animate-fade-in shadow-xs">
                <button
                  onClick={() => setAiResponseText("")}
                  className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
                {aiResponseText}
              </div>
            )}
          </div>
        </div>

        {/* EMPLOYEE PROGRESS, QUIZ SCORES & CERT TRACKING - RIGHT PANEL (5 columns) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* ACTIVE EMPLOYEE REGISTRY LIST */}
          <div className="bg-[#E3F3FF] p-5 rounded-2xl border border-[#A9CDEE] space-y-4 shadow-xs text-left">
            <div className="border-b border-[#A9CDEE]/40 pb-2">
              <h3 className="text-xs font-black uppercase text-[#342D7E] tracking-wider flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#4A9BFF]" /> Employee Training Profiles
              </h3>
              <p className="text-[10px] text-slate-400 font-sans mt-0.5 leading-normal">
                Review assigned lessons, certified standards, and compliance status.
              </p>
            </div>

            {/* Profiles stack */}
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto">
              {profiles.map(profile => {
                const totalAssigned = profile.assignedCourseIds.length;
                const totalCompleted = profile.completedCourseIds.length;
                const ratio = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 100;
                
                const isExpired = profile.certifications.some(c => c.status === "Expired");
                const isSelected = selectedEmployeeName === profile.employeeName;

                return (
                  <div
                    key={profile.employeeName}
                    onClick={() => {
                      setSelectedEmployeeName(profile.employeeName);
                      setSelectedCourse(null); // Deselect course to focus on employee
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected 
                        ? "bg-white border-[#342D7E] shadow-xs" 
                        : "bg-[#F5FAFF] hover:bg-slate-50 border-[#A9CDEE]/50"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#E3F3FF] text-[#4A9BFF] font-black text-xs flex items-center justify-center uppercase border border-[#A9CDEE]/40">
                          {profile.employeeName.substring(0, 2)}
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-slate-800">{profile.employeeName}</p>
                          <p className="text-[9.5px] text-slate-400 font-mono mt-0.5">{profile.role} • {profile.department}</p>
                        </div>
                      </div>

                      {/* Certification status tags */}
                      <div className="flex flex-col items-end gap-1 text-[9px] font-bold uppercase tracking-wider">
                        {isExpired ? (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded border border-rose-200 flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3 shrink-0" /> Expirations
                          </span>
                        ) : profile.certifications.length > 0 ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded border border-emerald-200">
                            ✓ Certified
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200">
                            None
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress indicators */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-[10px] font-semibold text-slate-400">
                      <div>
                        <span className="block text-[8px] uppercase font-bold text-slate-400">Course Ratio</span>
                        <span className="text-[#342D7E] font-black">{totalCompleted} / {totalAssigned} done</span>
                      </div>
                      <div>
                        <span className="block text-[8px] uppercase font-bold text-slate-400">Classroom Hours</span>
                        <span className="text-[#342D7E] font-black">{profile.trainingHours} hrs logged</span>
                      </div>
                    </div>

                    {/* Progress track */}
                    <div className="mt-2 w-full bg-slate-200/50 rounded-full h-1 overflow-hidden">
                      <div 
                        className={`h-1 rounded-full transition-all duration-300 ${isExpired ? "bg-rose-500" : "bg-emerald-500"}`}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CHOSEN EMPLOYEE COMPLIANCE PROFILE PREVIEW */}
          {activeEmployeeProfile && (
            <div className="bg-white rounded-2xl p-5 border border-[#342D7E] shadow-sm space-y-4 animate-fade-in text-left">
              <div className="border-b pb-3 relative">
                <button
                  onClick={() => setSelectedEmployeeName(null)}
                  className="absolute top-0 right-0 w-6 h-6 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 cursor-pointer text-xs"
                >
                  ✕
                </button>
                <span className="text-[10px] font-black uppercase text-[#4A9BFF] tracking-wider">Employee Performance Record</span>
                <h3 className="text-sm font-black text-[#342D7E] uppercase mt-0.5">{activeEmployeeProfile.employeeName}</h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">{activeEmployeeProfile.role} • {activeEmployeeProfile.department} team</p>
              </div>

              {/* Course detailed logs */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enrollment Curriculum</h4>
                
                <div className="space-y-2 max-h-[160px] overflow-y-auto">
                  {activeEmployeeProfile.assignedCourseIds.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No courses currently assigned.</p>
                  ) : (
                    activeEmployeeProfile.assignedCourseIds.map(cId => {
                      const courseRef = courses.find(c => c.id === cId);
                      const progress = activeEmployeeProfile.courseProgress[cId] || 0;
                      return (
                        <div key={cId} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5 font-sans">
                          <div className="flex justify-between items-center font-bold text-slate-800">
                            <span className="uppercase tracking-wider">{courseRef?.name || cId}</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                            <div 
                              className={`h-1 rounded-full ${progress === 100 ? "bg-emerald-500" : "bg-[#4A9BFF]"}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Certifications Tracker */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Licenses & Certifications</h4>
                
                <div className="space-y-2">
                  {activeEmployeeProfile.certifications.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No certifications recorded on central ledger.</p>
                  ) : (
                    activeEmployeeProfile.certifications.map(cert => (
                      <div
                        key={cert.id}
                        className={`p-2.5 rounded-xl border text-xs flex justify-between items-center ${
                          cert.status === "Expired" 
                            ? "bg-rose-50 border-rose-200 text-rose-800" 
                            : cert.status === "Expiring Soon" 
                            ? "bg-amber-50 border-amber-200 text-amber-800" 
                            : "bg-emerald-50 border-emerald-200 text-emerald-800"
                        }`}
                      >
                        <div className="font-bold">
                          <p className="uppercase tracking-wide">{cert.name}</p>
                          <p className="text-[9.5px] text-slate-400 font-mono font-medium mt-0.5">Expires: {cert.expirationDate}</p>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          {cert.status === "Expired" ? (
                            <button
                              onClick={() => {
                                // Simulate re-onboarding / renewal
                                setProfiles(prev => prev.map(p => {
                                  if (p.employeeName === activeEmployeeProfile.employeeName) {
                                    const updatedCerts = p.certifications.map(c => 
                                      c.id === cert.id 
                                        ? { ...c, status: "Active" as const, expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] } 
                                        : c
                                    );
                                    triggerNotification(`Renewed ${cert.name} for ${p.employeeName}`);
                                    return { ...p, certifications: updatedCerts };
                                  }
                                  return p;
                                }));
                              }}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-black rounded uppercase cursor-pointer"
                            >
                              Renew License
                            </button>
                          ) : (
                            <span className="text-[9.5px] font-mono tracking-wider font-extrabold">{cert.status}</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ACTIVE REGULATORY COMPLIANCE MONITOR */}
          <div className="bg-[#E3F3FF] p-5 rounded-2xl border border-[#A9CDEE] space-y-4 shadow-xs text-left">
            <div className="border-b border-[#A9CDEE]/40 pb-2 flex justify-between items-center">
              <div>
                <h3 className="text-xs font-black uppercase text-[#342D7E] tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-500" /> Compliance Lockouts & Audits
                </h3>
                <p className="text-[10px] text-slate-400 font-sans mt-0.5">
                  Auto-flagging team technicians with expired federal safety certifications.
                </p>
              </div>
              <span className="text-[9.5px] px-2 py-0.5 bg-rose-100 text-rose-600 font-mono font-bold border border-rose-200 rounded">
                Alert Active
              </span>
            </div>

            <div className="space-y-3">
              {profiles.some(p => p.certifications.some(c => c.status === "Expired")) ? (
                profiles.filter(p => p.certifications.some(c => c.status === "Expired")).map(p => {
                  const expiredCert = p.certifications.find(c => c.status === "Expired")!;
                  return (
                    <div key={p.employeeName} className="p-3 bg-white rounded-xl border border-rose-200 text-xs flex flex-col gap-2 shadow-xs">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 font-bold text-slate-800">
                          <div className="p-1 bg-rose-50 text-rose-500 rounded border border-rose-200">
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-rose-600 uppercase tracking-wide">Federal Standard Lockout</p>
                            <p className="text-slate-500 text-[10px] font-mono mt-0.5">Tech: {p.employeeName} ({p.role})</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-black bg-rose-100 text-rose-600 border border-rose-200 px-2 py-0.5 rounded uppercase">
                          Action Required
                        </span>
                      </div>
                      
                      <p className="text-[11px] text-slate-500 font-sans leading-normal font-semibold">
                        This tech cannot be scheduled for specialized jobs due to expired certification: <strong>{expiredCert.name}</strong>.
                      </p>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            // Assign training course linked to certification to get them active
                            handleAssignCourse("course_osha", p.employeeName);
                          }}
                          className="flex-1 py-2 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-black rounded-lg cursor-pointer text-center uppercase"
                        >
                          Assign OSHA Refresh
                        </button>
                        
                        <button
                          onClick={() => {
                            // Security grace period simulation
                            setProfiles(prev => prev.map(item => {
                              if (item.employeeName === p.employeeName) {
                                const certs = item.certifications.map(c => 
                                  c.status === "Expired" ? { ...c, status: "Active" as const, expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] } : c
                                );
                                triggerNotification(`Granted 30-day credential grace period on ${p.employeeName}`);
                                return { ...item, certifications: certs };
                              }
                              return item;
                            }));
                          }}
                          className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[10px] font-black rounded-lg cursor-pointer text-center uppercase"
                        >
                          Grant Grace Period
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 bg-[#F5FAFF] rounded-xl text-center text-xs text-slate-400 italic">
                  All active roster personnel are currently in compliance.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ADMIN CREATE COURSE MODAL */}
      {showCreateCourseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-left">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative">
            <button
              onClick={() => setShowCreateCourseModal(false)}
              className="absolute top-4 right-4 w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold border border-slate-200"
            >
              ✕
            </button>

            <h3 className="text-sm font-sans font-extrabold text-[#1F3557] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Plus className="w-5 h-5 text-[#4A9BFF]" /> Create New Specialized Course
            </h3>

            <form onSubmit={handleCreateCourseSubmit} className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wide">Course Name</label>
                  <input
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    type="text"
                    required
                    placeholder="e.g. Tankless Water Heaters"
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wide">Category</label>
                  <select
                    value={newCourseCategory}
                    onChange={(e: any) => setNewCourseCategory(e.target.value)}
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-2 py-2.5 focus:outline-none"
                  >
                    <option value="Safety">Safety Standards</option>
                    <option value="HVAC">HVAC Technology</option>
                    <option value="Electrical">Electrical Standards</option>
                    <option value="CDL">CDL / Fleet</option>
                    <option value="Office">Office Operations</option>
                    <option value="Onboarding">Onboarding</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase tracking-wide">Syllabus / Course Description</label>
                <textarea
                  value={newCourseDesc}
                  onChange={(e) => setNewCourseDesc(e.target.value)}
                  required
                  rows={2}
                  placeholder="Describe educational scope..."
                  className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none"
                />
              </div>

              {/* Roles assignment checkbox */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase tracking-wide">Assigned Onboarding Roles</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-[#F5FAFF] border border-[#A9CDEE]/60 rounded-xl">
                  {["Technician", "Driver", "Office Manager", "Salesperson", "Dispatcher"].map(role => (
                    <label key={role} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newCourseRoles.includes(role)}
                        onChange={() => toggleCourseCreatorRole(role)}
                        className="accent-[#4A9BFF]"
                      />
                      <span className="text-[11px] font-semibold text-slate-600">{role}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wide">Time Estimate</label>
                  <input
                    value={newCourseTime}
                    onChange={(e) => setNewCourseTime(e.target.value)}
                    type="text"
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2.5 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wide">Difficulty</label>
                  <select
                    value={newCourseDifficulty}
                    onChange={(e: any) => setNewCourseDifficulty(e.target.value)}
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-2 py-2.5 focus:outline-none"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
              </div>

              {/* Lesson initial item */}
              <div className="border-t pt-3 border-[#A9CDEE]/40 space-y-3">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wide">First Lesson Unit Setup</h4>
                <div className="space-y-2">
                  <input
                    value={newCourseLessonTitle}
                    onChange={(e) => setNewCourseLessonTitle(e.target.value)}
                    type="text"
                    placeholder="Lesson Title (e.g. Lesson 1: Introduction)"
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 focus:outline-none"
                  />
                  <textarea
                    value={newCourseLessonContent}
                    onChange={(e) => setNewCourseLessonContent(e.target.value)}
                    rows={2}
                    placeholder="Lesson text body..."
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 focus:outline-none"
                  />
                </div>
              </div>

              {/* Quiz initial item */}
              <div className="border-t pt-3 border-[#A9CDEE]/40 space-y-3">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wide">Syllabus Initial Test Question</h4>
                <div className="space-y-2">
                  <input
                    value={newCourseQuizQ}
                    onChange={(e) => setNewCourseQuizQ(e.target.value)}
                    type="text"
                    placeholder="Question (e.g. What safety tool should we carry?)"
                    className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={newCourseQuizOptions}
                      onChange={(e) => setNewCourseQuizOptions(e.target.value)}
                      type="text"
                      placeholder="Options comma separated..."
                      className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 focus:outline-none text-[10px]"
                    />
                    <input
                      value={newCourseQuizAns}
                      onChange={(e) => setNewCourseQuizAns(e.target.value)}
                      type="text"
                      placeholder="Correct Option..."
                      className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-3 py-2 focus:outline-none text-[10px]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateCourseModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-center cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-center cursor-pointer uppercase tracking-wider"
                >
                  Save & Publish Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN TRAINING MODAL */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-left text-xs font-semibold">
          <div className="bg-[#EAF5FF] border border-[#9EC8EF] rounded-2xl w-full max-w-md shadow-2xl p-6 relative">
            <button
              onClick={() => setShowAssignModal(false)}
              className="absolute top-4 right-4 w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold border border-slate-200"
            >
              ✕
            </button>

            <h3 className="text-sm font-sans font-extrabold text-[#1F3557] uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <UserCheck className="w-5 h-5 text-[#4A9BFF]" /> Assign Specialized Curriculum
            </h3>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase tracking-wide">Select Training Course</label>
                <select
                  value={assignTargetCourseId}
                  onChange={(e) => setAssignTargetCourseId(e.target.value)}
                  className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-2 py-2.5 focus:outline-none cursor-pointer"
                >
                  <option value="">-- Choose Course --</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase tracking-wide">Select Roster Employee</label>
                <select
                  value={assignTargetEmployeeName}
                  onChange={(e) => setAssignTargetEmployeeName(e.target.value)}
                  className="w-full bg-[#F5FAFF] border border-[#A9CDEE] rounded-xl px-2 py-2.5 focus:outline-none cursor-pointer"
                >
                  <option value="">-- Choose Employee --</option>
                  {rosterCandidates.map(employee => (
                    <option key={employee.id} value={employee.name}>{employee.name} ({employee.role})</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-center cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={!assignTargetCourseId || !assignTargetEmployeeName}
                  onClick={() => handleAssignCourse(assignTargetCourseId, assignTargetEmployeeName)}
                  className="flex-1 py-3 bg-[#4A9BFF] hover:bg-[#3583E6] disabled:opacity-40 text-white font-black rounded-xl text-center cursor-pointer uppercase tracking-wider"
                >
                  Assign Course Unit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
