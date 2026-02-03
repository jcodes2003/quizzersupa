import type { MultipleChoiceQuestion, IdentificationQuestion, EnumerationQuestion } from "./quiz-data";

export const iteraMultipleChoice: MultipleChoiceQuestion[] = [
  { id: "itera-mc1", question: "What does ICT stand for?", options: ["Information and Computer Technology", "Information and Communications Technology", "Integrated Computer Transmission", "Information and Connection Tools"], correct: "Information and Communications Technology" },
  { id: "itera-mc2", question: "Which of the following is NOT a primary use of Information Technology?", options: ["Gathering information", "Protecting information", "Manufacturing physical hardware", "Storing information"], correct: "Manufacturing physical hardware" },
  { id: "itera-mc3", question: "What percentage of your grade is allocated to \"Class Standing\"?", options: ["40%", "50%", "60%", "70%"], correct: "60%" },
  { id: "itera-mc4", question: "Which type of learning is \"not limited by time, place, or pace\"?", options: ["Traditional Learning", "Flexible Learning", "Static Learning", "Fixed Learning"], correct: "Flexible Learning" },
  { id: "itera-mc5", question: "Which component is considered the \"brain\" of the computer?", options: ["Motherboard", "RAM", "Processor (CPU)", "Hard Disk"], correct: "Processor (CPU)" },
  { id: "itera-mc6", question: "This type of network has a range of approximately 10 meters and is used by one person.", options: ["LAN", "PAN", "MAN", "WAN"], correct: "PAN" },
  { id: "itera-mc7", question: "What is the main difference between hardware and software?", options: ["Hardware is the brain, software is the body.", "Hardware is intangible, software is tangible.", "Hardware can be touched; software is a set of instructions.", "Hardware cannot work without the internet; software can."], correct: "Hardware can be touched; software is a set of instructions." },
  { id: "itera-mc8", question: "Which computer type is specifically designed to handle millions of transactions, such as in a bank?", options: ["Workstation", "Supercomputer", "Mainframe", "Tablet"], correct: "Mainframe" },
  { id: "itera-mc9", question: "What does the \"IPO Cycle\" stand for in computing?", options: ["Internal-Processing-Online", "Input-Process-Output", "Input-Program-Operation", "Integrated-Personal-Output"], correct: "Input-Process-Output" },
  { id: "itera-mc10", question: "A network that connects computers in a small area like a home or a school computer lab is called:", options: ["WAN", "CAN", "LAN", "EPN"], correct: "LAN" },
  { id: "itera-mc11", question: "Which part of the computer provides permanent storage for data?", options: ["RAM", "GPU", "Hard Disk", "Power Supply"], correct: "Hard Disk" },
  { id: "itera-mc12", question: "What is the required document that serves as an agreement between student and teacher to improve learning behavior?", options: ["Syllabus", "Learning Contract", "Class Schedule", "Grading Sheet"], correct: "Learning Contract" },
  { id: "itera-mc13", question: "Which of the following ICT services requires an internet connection?", options: ["Using Microsoft Excel offline", "Printing a document via USB", "Accessing Google Drive", "Saving a file to the desktop"], correct: "Accessing Google Drive" },
  { id: "itera-mc14", question: "This type of computer is fixed in one place, such as an office or a school lab.", options: ["Laptop", "Desktop", "Netbook", "PDA"], correct: "Desktop" },
  { id: "itera-mc15", question: "What type of network covers an entire city or town?", options: ["CAN", "LAN", "MAN", "PAN"], correct: "MAN" },
  { id: "itera-mc16", question: "Which computer component is responsible for handling graphics?", options: ["CPU", "Motherboard", "RAM", "GPU"], correct: "GPU" },
  { id: "itera-mc17", question: "Which is the fastest type of computer, used for weather forecasting and space studies?", options: ["Mainframe", "Server", "Supercomputer", "Workstation"], correct: "Supercomputer" },
  { id: "itera-mc18", question: "What does \"VPN\" stand for?", options: ["Visible Personal Network", "Virtual Private Network", "Verified Public Network", "Variable Private Node"], correct: "Virtual Private Network" },
  { id: "itera-mc19", question: "Which of these is an example of \"Wearable\" technology?", options: ["Smartphone", "Tablet", "Smartwatch", "Laptop"], correct: "Smartwatch" },
  { id: "itera-mc20", question: "What is the \"Motherboard\"?", options: ["The temporary memory", "The main circuit board", "The power source", "The permanent storage"], correct: "The main circuit board" },
  { id: "itera-mc21", question: "In a school setting, a network that covers multiple buildings on a campus is called a:", options: ["PAN", "CAN", "MAN", "WAN"], correct: "CAN" },
  { id: "itera-mc22", question: "RAM is considered what type of memory?", options: ["Permanent", "Temporary", "External", "Read-Only"], correct: "Temporary" },
  { id: "itera-mc23", question: "Which of the following is a rule in GEN 008?", options: ["Phone use is allowed during class.", "Wear proper uniform.", "Submission of tasks is optional.", "Be late to show importance."], correct: "Wear proper uniform." },
  { id: "itera-mc24", question: "This network connects high-performance computers for large data processing (e.g., used by Microsoft).", options: ["StAN", "SysAN", "POLAN", "EPN"], correct: "SysAN" },
  { id: "itera-mc25", question: "What is the main purpose of a \"Server\"?", options: ["To perform weather forecasting", "To provide services to other computers", "To act as a personal computer for one user", "To be carried around easily"], correct: "To provide services to other computers" },
  { id: "itera-mc26", question: "Which type of laptop is generally smaller and cheaper than a standard laptop?", options: ["Workstation", "Tablet", "Netbook", "Mainframe"], correct: "Netbook" },
  { id: "itera-mc27", question: "A Bluetooth connection between a phone and a speaker is an example of what network?", options: ["LAN", "WAN", "PAN", "CAN"], correct: "PAN" },
  { id: "itera-mc28", question: "What is the \"Software\" in a computer system?", options: ["The physical body", "The programs or set of instructions", "The computer case", "The power supply unit"], correct: "The programs or set of instructions" },
  { id: "itera-mc29", question: "Which specialized network is used for high-speed storage devices?", options: ["SysAN", "POLAN", "StAN", "VPN"], correct: "StAN" },
  { id: "itera-mc30", question: "In the grading system, the Final Examination accounts for how much of the total grade?", options: ["20%", "40%", "60%", "100%"], correct: "40%" },
];

export const iteraIdentification: IdentificationQuestion[] = [
  { id: "itera-id1", question: "The use of computers to gather, process, store, protect, and transfer information.", correct: ["Information Technology", "IT"] },
  { id: "itera-id2", question: "The term for the combination of IT, the internet, and communication.", correct: "ICT" },
  { id: "itera-id3", question: "The component that protects all the internal parts of the computer.", correct: ["Computer Case", "Case"] },
  { id: "itera-id4", question: "A secure network used by businesses to connect different office locations.", correct: ["Enterprise Private Network", "EPN"] },
  { id: "itera-id5", question: "Small, portable computers such as smartphones and PDAs.", correct: ["Handheld Computers", "Handheld"] },
  { id: "itera-id6", question: "A touchscreen device that usually does not require a physical keyboard.", correct: "Tablet" },
  { id: "itera-id7", question: "A wireless version of a Local Area Network.", correct: "WLAN" },
  { id: "itera-id8", question: "The specific hardware component that provides electrical power to the computer.", correct: ["Power Supply", "PSU"] },
  { id: "itera-id9", question: "The act of sharing resources and information between a group of connected devices.", correct: ["Computer Network", "Network"] },
  { id: "itera-id10", question: "The intangible part of the computer system that tells the hardware what to do.", correct: "Software" },
];

export const iteraEnumeration: EnumerationQuestion[] = [
  {
    id: "itera-enum1",
    question: "Enumerate five (5) examples of ICT service that require an internet connection.",
    correct: ["Sending emails", "Google Classroom", "Zoom", "Teams", "Cloud storage", "Google Drive", "Social media"],
  },
  {
    id: "itera-enum2",
    question: "Enumerate five (5) internal hardware parts of a computer.",
    correct: ["Processor", "CPU", "Motherboard", "RAM", "Hard Disk", "Hard Drive", "GPU", "Power Supply"],
  },
];
