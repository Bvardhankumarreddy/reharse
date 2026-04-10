"use client";

// Spec § 5: "Animation: Framer Motion — smooth transitions, interview mode focus animations"

import { motion } from "framer-motion";

const variants = {
  hidden: { opacity: 0, y: 10 },
  enter:  { opacity: 1, y: 0  },
  exit:   { opacity: 0, y: -6 },
};

export default function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="enter"
      exit="exit"
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
