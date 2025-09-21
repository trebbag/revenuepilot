import { motion } from "motion/react"
import { AlertTriangle, Check, Settings } from "lucide-react"

type StepStatus = "pending" | "in-progress" | "completed" | "blocked"

interface Step {
  id: number;
  title: string;
  description: string;
  status?: StepStatus;
}

interface ProgressIndicatorProps {
  steps: Step[];
  currentStep: number;
  onStepClick: (stepId: number) => void;
}

export function ProgressIndicator({ steps, currentStep, onStepClick }: ProgressIndicatorProps) {
  const getStepProgress = () => {
    if (steps.length <= 1) {
      return 0;
    }

    const normalizedStatuses = steps.map(step => {
      if (step.status) {
        return step.status;
      }
      if (step.id < currentStep) {
        return "completed" as StepStatus;
      }
      if (step.id === currentStep) {
        return "in-progress" as StepStatus;
      }
      return "pending" as StepStatus;
    });

    const highestCompletedIndex = normalizedStatuses.reduce(
      (acc, status, index) => (status === "completed" ? Math.max(acc, index) : acc),
      -1
    );
    const firstActiveIndex = normalizedStatuses.findIndex(status =>
      status === "in-progress" || status === "blocked"
    );

    let progressIndex: number;
    if (firstActiveIndex !== -1) {
      progressIndex = firstActiveIndex;
    } else if (highestCompletedIndex >= 0) {
      progressIndex = highestCompletedIndex + 1;
    } else {
      progressIndex = Math.max(0, currentStep - 1);
    }

    const clamped = Math.max(0, Math.min(steps.length - 1, progressIndex));
    return (clamped / (steps.length - 1)) * 100;
  };

  return (
    <div className="bg-white/95 backdrop-blur-lg border-b border-slate-200/50 shadow-sm">
      <div className="w-full px-12 py-8 flex items-center justify-center min-h-0">
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-16 w-full"
        >
          {/* Far Left: Title Section */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              >
                <Settings size={26} className="text-white" />
              </motion.div>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-blue-700 bg-clip-text text-transparent">
                Finalization Wizard
              </h1>
              <p className="text-sm text-slate-600 mt-1">AI-powered documentation refinement and clinical decision support</p>
            </div>
          </div>

          {/* Far Right: Extended Progress Bar Container */}
          <div className="relative flex-1 min-w-0" style={{ height: '80px' }}>
            {/* Step indicators positioned to align with progress track */}
            <div className="absolute top-1/2 -translate-y-1/2 w-full px-8 flex justify-between items-center z-10">
              {steps.map((step, index) => {
                const status: StepStatus = step.status
                  ? step.status
                  : step.id < currentStep
                    ? "completed"
                    : step.id === currentStep
                      ? "in-progress"
                      : "pending";
                const isCompleted = status === "completed";
                const isInProgress = status === "in-progress";
                const isBlocked = status === "blocked";

                return (
                  <motion.div
                    key={step.id}
                    className="flex flex-col items-center relative"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.07 }}
                  >
                    <motion.button
                      onClick={() => onStepClick(step.id)}
                      className={`
                        w-12 h-12 rounded-full flex items-center justify-center cursor-pointer
                        transition-all duration-300 group relative
                        ${isBlocked
                          ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-lg ring-2 ring-red-300/60'
                          : isCompleted
                          ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg'
                          : isInProgress
                          ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-xl ring-2 ring-blue-300/50'
                          : 'bg-white border-2 border-slate-300 text-slate-600 hover:border-blue-400 hover:shadow-lg'
                        }
                      `}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                      animate={isInProgress ? {
                        boxShadow: [
                          "0 6px 20px rgba(59, 130, 246, 0.25)",
                          "0 10px 30px rgba(59, 130, 246, 0.35)",
                          "0 6px 20px rgba(59, 130, 246, 0.25)"
                        ]
                      } : {}}
                      transition={{ duration: 2, repeat: isInProgress ? Infinity : 0, ease: "easeInOut" }}
                    >
                      {isCompleted ? (
                        <motion.div
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ duration: 0.4, type: "spring" }}
                        >
                          <Check size={16} />
                        </motion.div>
                      ) : isBlocked ? (
                        <AlertTriangle size={16} />
                      ) : step.id === 0 ? (
                        <Settings size={14} />
                      ) : (
                        <motion.span
                          className="font-semibold text-sm"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.07 + 0.2 }}
                        >
                          {step.id}
                        </motion.span>
                      )}
                    </motion.button>

                    <motion.div
                      className="absolute top-full mt-2 text-center left-1/2 -translate-x-1/2"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.07 + 0.3 }}
                    >
                      <div className={`text-sm font-medium transition-colors duration-300 whitespace-nowrap ${
                        isBlocked
                          ? 'text-red-600'
                          : isCompleted
                          ? 'text-emerald-600'
                          : isInProgress
                          ? 'text-blue-600'
                          : 'text-slate-600'
                      }`}>
                        {step.title}
                      </div>
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>

            {/* Progress Track - positioned to align with step circles */}
            <div className="absolute top-1/2 -translate-y-0.5 w-full h-1 z-0">
              <div className="relative h-full mx-8">
                <div className="h-full bg-slate-200/80 rounded-full">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-400/90 to-indigo-500/90 rounded-full relative overflow-hidden"
                    initial={{ width: "0%" }}
                    animate={{ 
                      width: currentStep === 1 ? "0%" : `${((currentStep - 1) / (steps.length - 1)) * 100}%` 
                    }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  >
                    {/* Enhanced animated shimmer effect */}
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                      animate={{
                        x: ['-100%', '100%']
                      }}
                      transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    />
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}