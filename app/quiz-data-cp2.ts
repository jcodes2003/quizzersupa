import type { MultipleChoiceQuestion, IdentificationQuestion } from "./quiz-data";

export const cp2MultipleChoice: MultipleChoiceQuestion[] = [
  { id: "cp2-mc1", question: "Which principle of Java allows programs to run on any device or OS?", options: ["Object-Oriented", "Write Once, Run Anywhere", "Platform Dependent", "Machine Code Execution"], correct: "Write Once, Run Anywhere" },
  { id: "cp2-mc2", question: "Which keyword is used to declare a constant in Java?", options: ["const", "static", "final", "constant"], correct: "final" },
  { id: "cp2-mc3", question: "What is the default data type for decimal numbers in Java?", options: ["float", "double", "int", "long"], correct: "double" },
  { id: "cp2-mc4", question: "Which operator is used to compare two values for equality?", options: ["=", "==", "!=", "equals()"], correct: "==" },
  { id: "cp2-mc5", question: "Which loop guarantees execution at least once?", options: ["for", "while", "do…while", "foreach"], correct: "do…while" },
  { id: "cp2-mc6", question: "Which Java method prints output with a newline?", options: ["print()", "println()", "printf()", "display()"], correct: "println()" },
  { id: "cp2-mc7", question: "Which of the following is NOT a primitive data type in Java?", options: ["int", "boolean", "String", "double"], correct: "String" },
  { id: "cp2-mc8", question: "Which control structure is best for multiple conditions?", options: ["if-else", "switch", "nested if", "while"], correct: "switch" },
  { id: "cp2-mc9", question: "Which keyword is used to define a class in Java?", options: ["object", "class", "define", "struct"], correct: "class" },
  { id: "cp2-mc10", question: "Which operator returns the remainder of division?", options: ["/", "%", "//", "mod"], correct: "%" },
  { id: "cp2-mc11", question: "Which package contains the Scanner class?", options: ["java.io", "java.util", "java.lang", "java.text"], correct: "java.util" },
  { id: "cp2-mc12", question: "Which statement ends a Java program immediately?", options: ["break", "exit()", "return", "stop"], correct: "return" },
  { id: "cp2-mc13", question: "Which keyword is used to inherit a class?", options: ["extends", "implements", "inherits", "super"], correct: "extends" },
  { id: "cp2-mc14", question: "Which of the following is a relational operator?", options: ["&&", ">=", "||", "++"], correct: ">=" },
  { id: "cp2-mc15", question: "Which loop is best when the number of iterations is known?", options: ["while", "do…while", "for", "foreach"], correct: "for" },
  { id: "cp2-mc16", question: "Which of the following is NOT a Java reserved word?", options: ["public", "static", "void", "main"], correct: "main" },
  { id: "cp2-mc17", question: "Which keyword is used to handle exceptions?", options: ["try", "catch", "throw", "All of the above"], correct: "All of the above" },
  { id: "cp2-mc18", question: "Which of the following is a valid variable name?", options: ["2value", "myValue", "class", "void"], correct: "myValue" },
  { id: "cp2-mc19", question: "Which operator is used for logical AND?", options: ["&", "&&", "and", "+"], correct: "&&" },
  { id: "cp2-mc20", question: "Which statement is true about Java arrays?", options: ["Arrays can store mixed data types", "Arrays are fixed in size", "Arrays are dynamic by default", "Arrays cannot store objects"], correct: "Arrays are fixed in size" },
  { id: "cp2-mc21", question: "Which keyword is used to stop a loop prematurely?", options: ["stop", "break", "return", "exit"], correct: "break" },
  { id: "cp2-mc22", question: "Which method is used to convert a string to an integer?", options: ["Integer.parseInt()", "String.toInt()", "parseInteger()", "convertInt()"], correct: "Integer.parseInt()" },
  { id: "cp2-mc23", question: "Which of the following is NOT a Java loop?", options: ["for", "while", "repeat", "do…while"], correct: "repeat" },
  { id: "cp2-mc24", question: "Which operator increases a variable by 1?", options: ["++", "+=", "+1", "inc"], correct: "++" },
  { id: "cp2-mc25", question: "Which keyword is used to define an interface?", options: ["interface", "abstract", "class", "struct"], correct: "interface" },
  { id: "cp2-mc26", question: "Which of the following is a Boolean value?", options: ["1", "0", "true", "null"], correct: "true" },
  { id: "cp2-mc27", question: "Which statement is used to skip the current iteration of a loop?", options: ["break", "continue", "skip", "return"], correct: "continue" },
  { id: "cp2-mc28", question: "Which of the following is NOT a Java access modifier?", options: ["public", "private", "protected", "global"], correct: "global" },
  { id: "cp2-mc29", question: "Which keyword is used to create objects?", options: ["new", "object", "create", "instance"], correct: "new" },
  { id: "cp2-mc30", question: "Which of the following is NOT a Java IDE?", options: ["NetBeans", "Eclipse", "Visual Studio Code", "Microsoft Word"], correct: "Microsoft Word" },
];

export const cp2Identification: IdentificationQuestion[] = [
  { id: "cp2-id1", question: "It is a character that we used to multiply a number in java", correct: ["*"] },
  { id: "cp2-id2", question: "The keyword used to declare constants in Java.", correct: "final" },
  { id: "cp2-id3", question: "The operator that returns the remainder of division.", correct: ["%", "modulus", "modulus operator"] },
  { id: "cp2-id4", question: "It is a way repeting a specific block of code", correct: ["Loop", "loops"] },
  { id: "cp2-id5", question: "A line of code use to show the output to the console is?", correct: "System.out.println();" },
  { id: "cp2-id6", question: "Condition first loop", correct: ["while, while loop"] },
  { id: "cp2-id7", question: "The keyword used to stop a loop prematurely.", correct: "break" },
  { id: "cp2-id8", question: "What data type is used to indicate that the variable will contain a whole number?", correct: ["int"] },
  { id: "cp2-id9", question: "The keyword used to define an interface.", correct: "interface" },
  { id: "cp2-id10", question: "a data item that cannot be changed is called what?", correct: "constant" },
];

export const cp2Programming = {
  problem: `A coffee shop sells three drinks: Americano (₱100), Latte (₱120), Cappuccino (₱130).

1. Declare variables for the prices.
2. Declare a variable order with value "Latte".
3. Print the name of the drink ordered and its price.
4. Print whether the price is above, below, or equal to ₱120.`,
  instructions: `Use NetBeans to write and run your Java code for this problem. After completing this quiz, submit your code together with your quiz score to the GCR (Google Classroom).`,
};
