import { cp2MultipleChoice, cp2Identification, cp2Programming } from "./quiz-data-cp2";
import { iteraMultipleChoice, iteraIdentification, iteraEnumeration } from "./quiz-data-itera";

export interface MultipleChoiceQuestion {
  id: string;
  question: string;
  options: string[];
  correct: string;
}

export interface IdentificationQuestion {
  id: string;
  question: string;
  correct: string | string[];
}

export interface EnumerationQuestion {
  id: string;
  question: string;
  correct: string[];
}

export const multipleChoiceQuestions: MultipleChoiceQuestion[] = [
  {
    id: "mc1",
    question: "HCI primarily studies the interaction between:",
    options: ["Hardware and Software", "User and Computer", "Teacher and Student", "Developer and Designer"],
    correct: "User and Computer",
  },
  {
    id: "mc2",
    question: "The main goal of HCI is to:",
    options: ["Make systems complex", "Produce usable and safe systems", "Focus only on aesthetics", "Eliminate technology"],
    correct: "Produce usable and safe systems",
  },
  {
    id: "mc3",
    question: "Ergonomics in HCI focuses on:",
    options: ["Reducing human error and increasing comfort", "Designing faster processors", "Improving internet speed", "Creating new programming languages"],
    correct: "Reducing human error and increasing comfort",
  },
  {
    id: "mc4",
    question: "Which device was among the first to popularize HCI in the 1980s?",
    options: ["Commodore 64", "PlayStation", "Nintendo Switch", "Kindle"],
    correct: "Commodore 64",
  },
  {
    id: "mc5",
    question: "Goal-driven design was popularized by:",
    options: ["Don Norman", "Alan Cooper", "Gillian Crampton-Smith", "Kevin Silver"],
    correct: "Alan Cooper",
  },
  {
    id: "mc6",
    question: "Which of the following is NOT a usability characteristic?",
    options: ["Easy to learn", "Safe to use", "Enjoyable to use", "Expensive to use"],
    correct: "Expensive to use",
  },
  {
    id: "mc7",
    question: 'The "C" button on a photocopier usually means:',
    options: ["Copy", "Clear", "Cancel", "Confirm"],
    correct: "Clear",
  },
  {
    id: "mc8",
    question: "The five dimensions of interaction design include:",
    options: ["Words, visuals, space, time, behavior", "Hardware, software, user, task, feedback", "Input, output, storage, processing, retrieval", "None of the above"],
    correct: "Words, visuals, space, time, behavior",
  },
  {
    id: "mc9",
    question: "Which UI type involves voice commands?",
    options: ["GUI", "VUI", "Gesture-based", "Text-based"],
    correct: "VUI",
  },
  {
    id: "mc10",
    question: "UX design focuses on:",
    options: ["Only the interface", "Entire user experience including branding and usability", "Hardware design only", "Programming efficiency"],
    correct: "Entire user experience including branding and usability",
  },
  {
    id: "mc11",
    question: "Which principle emphasizes consistency in UI design?",
    options: ["Familiarity", "Hierarchy", "Clarity", "Consistency"],
    correct: "Consistency",
  },
  {
    id: "mc12",
    question: "Allowing users to undo mistakes supports:",
    options: ["Internal locus of control", "Error prevention", "User control", "Flexibility"],
    correct: "User control",
  },
  {
    id: "mc13",
    question: "Which principle reduces cognitive load?",
    options: ["Recognition over recall", "Hierarchy", "Negative space", "Familiarity"],
    correct: "Recognition over recall",
  },
  {
    id: "mc14",
    question: "Which element of design refers to the lightness or darkness of a color?",
    options: ["Line", "Value", "Shape", "Texture"],
    correct: "Value",
  },
  {
    id: "mc15",
    question: "Organic shapes are:",
    options: ["Angular and mathematical", "Naturally occurring", "Abstract representations", "Geometric"],
    correct: "Naturally occurring",
  },
  {
    id: "mc16",
    question: "Wireframes are used to:",
    options: ["Finalize design aesthetics", "Suggest structure and layout", "Replace sketches entirely", "Add textures"],
    correct: "Suggest structure and layout",
  },
  {
    id: "mc17",
    question: "Storyboards in design are used to:",
    options: ["Plan linear narratives of user flow", "Create final prototypes", "Replace wireframes", "Add animations"],
    correct: "Plan linear narratives of user flow",
  },
  {
    id: "mc18",
    question: "Which stage involves high-fidelity GUI design?",
    options: ["Ideation", "Storyboarding", "Prototyping", "Wireframing"],
    correct: "Prototyping",
  },
  {
    id: "mc19",
    question: "Which principle emphasizes arranging elements by importance?",
    options: ["Hierarchy", "Flexibility", "Familiarity", "Negative space"],
    correct: "Hierarchy",
  },
  {
    id: "mc20",
    question: "Which design tool combines wireframes with flowcharts?",
    options: ["Mockup", "Wireflow", "Storyboard", "Prototype"],
    correct: "Wireflow",
  },
];

export const identificationQuestions: IdentificationQuestion[] = [
  { id: "id1", question: "Field of study focusing on human-computer interaction.", correct: ["Human-Computer Interaction", "HCI"] },
  { id: "id2", question: "The three parts of HCI (user, computer, ________).", correct: "Task" },
  { id: "id3", question: "The design methodology that prioritizes user goals.", correct: "Goal-driven design" },
  { id: "id4", question: "The academic who introduced the four dimensions of interaction design.", correct: ["Gillian Crampton-Smith", "Gillian Crampton Smith"] },
  { id: "id5", question: "The fifth dimension added to interaction design.", correct: "Behavior" },
  { id: "id6", question: "The study of mental processes like memory and problem-solving.", correct: "Cognitive psychology" },
  { id: "id7", question: "A design metaphor resembling a trash can icon.", correct: "Desktop metaphor" },
  { id: "id8", question: "A button designed to look pushable is an example of ________.", correct: "Affordance" },
  { id: "id9", question: "Interface type where users interact through visuals.", correct: ["Graphical User Interface", "GUI"] },
  { id: "id10", question: "Interface type where users interact through gestures.", correct: ["Gesture-based interface", "Gesture-based", "Gesture based"] },
  { id: "id11", question: "Principle that ensures users feel in control.", correct: "Internal locus of control" },
  { id: "id12", question: "Principle that reduces memory load.", correct: "Recognition over recall" },
  { id: "id13", question: "Element of design that refers to space around objects.", correct: "Negative space" },
  { id: "id14", question: "Element of design that refers to tactile or visual feel.", correct: "Texture" },
  { id: "id15", question: "Shapes that are angular and mathematically consistent.", correct: "Geometric shapes" },
  { id: "id16", question: "Shapes that represent things in nature but aren't exact.", correct: "Abstract shapes" },
  { id: "id17", question: "Quick, inexpensive, disposable drawings used in design.", correct: "Sketches" },
  { id: "id18", question: "Basic visual guide showing structure of a website.", correct: "Wireframe" },
  { id: "id19", question: "Tool used to plan linear narrative flows.", correct: "Storyboard" },
  { id: "id20", question: "High-fidelity design stage tool for product demonstration.", correct: "Prototype" },
];

export const enumerationQuestions: EnumerationQuestion[] = [
  { id: "enum4", question: "List the three types of user interfaces.", correct: ["GUI", "VUI", "Gesture-based"] },
  { id: "enum5", question: "Enumerate the golden rules of UI design.", correct: ["Consistency", "Universal usability", "Informative feedback", "Design dialogs to yield closure", "Prevent errors", "Permit easy reversal of actions", "Support internal locus of control", "Reduce short-term memory load"] },
  { id: "enum7", question: "Enumerate the elements of design.", correct: ["Line", "Shape", "Color", "Value", "Texture", "Space"] },
];

export type QuizTopic = "hci" | "cp2" | "itera";

export interface ProgrammingSection {
  problem: string;
  instructions: string;
}

export interface QuizData {
  title: string;
  multipleChoice: MultipleChoiceQuestion[];
  identification: IdentificationQuestion[];
  enumeration?: EnumerationQuestion[];
  programming?: ProgrammingSection;
}

export const QUIZ_BY_TOPIC: Record<QuizTopic, QuizData | null> = {
  hci: {
    title: "Human Computer Interaction",
    multipleChoice: multipleChoiceQuestions,
    identification: identificationQuestions,
    enumeration: enumerationQuestions,
  },
  cp2: {
    title: "Computer Programming 2",
    multipleChoice: cp2MultipleChoice,
    identification: cp2Identification,
    programming: cp2Programming,
  },
  itera: {
    title: "Living in IT Era",
    multipleChoice: iteraMultipleChoice,
    identification: iteraIdentification,
    enumeration: iteraEnumeration,
  },
};  