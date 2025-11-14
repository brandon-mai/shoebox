"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";

const EXCERPTS = [
  "The quick brown fox jumps over the lazy dog. This classic pangram contains every letter of the alphabet at least once. Typing exercises help us master keyboard layouts and improve our communication skills.",
  "Wife bought something on FB Marketplace but she's afraid she'll get kidnapped so she sends me to pick it up from a guy who's wife sent him because she's afraid to get kidnapped.",
  "Glasses are really versatile. First, you can have glasses-wearing girls take them off and suddenly become beautiful, or have girls wearing glasses flashing those cute grins, or have girls stealing the protagonist's glasses and putting them on like, \"Haha, got your glasses!\" That's just way too cute!",
  "Also, boys with glasses! I really like when their glasses have that suspicious looking gleam, and it's amazing how it can look really cool or just be a joke. I really like how it can fulfill all those abstract needs.",
  "Being able to switch up the styles and colors of glasses based on your mood is a lot of fun too! It's actually so much fun! You have those half rim glasses, or the thick frame glasses, everything! It's like you're enjoying all these kinds of glasses at a buffet.",
  "I really want Luna to try some on or Marine to try some on to replace her eyepatch. We really need glasses to become a thing in hololive and start selling them for HoloComi. Don't. You. Think. We. Really. Need. To. Officially. Give. Everyone. Glasses?",
];

const getRandomExcerpt = () => {
  return EXCERPTS[Math.floor(Math.random() * EXCERPTS.length)];
};

const TIMER = 30;

interface GameState {
  text: string;
  userInput: string;
  startTime: number | null;
  timer: number;
  isGameReady: boolean;
  isGameActive: boolean;
  isGamePaused: boolean;
  isGameFinished: boolean;

  pauseStartTime: number | null;
  totalPausedDuration: number;

  finalWPM: number;
  finalAccuracy: number;
}

interface GameResult {
  wpm: number;
  accuracy: number;
  duration: number;
  wpmHistory?: Array<{ time: number; wpm: number }>;
}

interface TypingGameProps {
  onGameFinish?: (result: GameResult) => void;
}

export function TypingGame({ onGameFinish }: TypingGameProps) {
  const [state, setState] = useState<GameState>({
    text: "",
    userInput: "",
    startTime: null,
    timer: TIMER,
    isGameReady: true,
    isGameActive: false,
    isGamePaused: false,
    isGameFinished: false,
    pauseStartTime: null,
    totalPausedDuration: 0,
    finalWPM: 0,
    finalAccuracy: 0,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const gameContainerRef = useRef<HTMLDivElement>(null);

  const [cursorPosition, setCursorPosition] = useState<{
    left: number | string;
    top: number;
  }>({ left: "-2", top: 2 });
  const [isCursorMoving, setIsCursorMoving] = useState(false);
  const cursorMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [currentWPM, setCurrentWPM] = useState(0);
  const [wpmHistory, setWpmHistory] = useState<Array<{ time: number; wpm: number }>>(
    []
  );

  const getCorrectChars = useCallback(
    (userInput: string, text: string): number => {
      return userInput
        .split("")
        .filter((char, index) => char === text[index]).length;
    },
    []
  );

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      text: getRandomExcerpt(),
    }));
  }, []);

  // Handle "click outside"
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        gameContainerRef.current &&
        !gameContainerRef.current.contains(event.target as Node)
      ) {
        if (state.isGameActive && !state.isGamePaused && !state.isGameFinished) {
          setState((prev) => ({
            ...prev,
            isGamePaused: true,
            pauseStartTime: Date.now(),
          }));
          inputRef.current?.blur();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [state.isGameActive, state.isGamePaused, state.isGameFinished]);

  // MODIFICATION: New effect to focus the input when the game starts
  useEffect(() => {
    if (state.isGameActive && !state.isGamePaused) {
      inputRef.current?.focus();
    }
  }, [state.isGameActive, state.isGamePaused]);

  // Track cursor movement state
  useEffect(() => {
    setIsCursorMoving(true);
    if (cursorMoveTimeoutRef.current) {
      clearTimeout(cursorMoveTimeoutRef.current);
    }
    cursorMoveTimeoutRef.current = setTimeout(() => {
      setIsCursorMoving(false);
    }, 150);
    return () => {
      if (cursorMoveTimeoutRef.current) {
        clearTimeout(cursorMoveTimeoutRef.current);
      }
    };
  }, [cursorPosition]);

  // Update cursor position
  useLayoutEffect(() => {
    if (!textContainerRef.current) return;
    const container = textContainerRef.current;
    const spans = container.querySelectorAll("span[data-char]");
    if (spans.length === 0) return;
    const currentIndex = state.userInput.length;
    if (currentIndex === 0) {
      setCursorPosition({ left: "-2", top: 0 });
    } else if (currentIndex < spans.length) {
      const targetSpan = spans[currentIndex] as HTMLElement;
      const rect = targetSpan.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setCursorPosition({
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
      });
    } else {
      const lastSpan = spans[spans.length - 1] as HTMLElement;
      const rect = lastSpan.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setCursorPosition({
        left: rect.right - containerRect.left,
        top: rect.top - containerRect.top,
      });
    }
  }, [state.userInput, state.text]);

  const handleStartGame = () => {
    setState((prev) => ({
      ...prev,
      isGameReady: false,
      isGameActive: true,
      startTime: Date.now(),
    }));
    // MODIFICATION: Removed .focus() call from here
    // inputRef.current?.focus();
  };

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!state.isGameActive || state.isGamePaused || state.isGameFinished) {
        return;
      }
      const value = e.target.value;
      setState((prev) => {
        return {
          ...prev,
          userInput: value,
        };
      });
    },
    [state.isGameActive, state.isGamePaused, state.isGameFinished]
  );

  // Timer interval
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (state.isGameActive && !state.isGamePaused && state.timer > 0) {
      interval = setInterval(() => {
        setState((prev) => ({
          ...prev,
          timer: prev.timer - 1,
        }));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [state.isGameActive, state.isGamePaused, state.timer]);

  // WPM calculation interval
  useEffect(() => {
    if (state.isGameActive && !state.isGamePaused && state.startTime) {
      const calculateWPM = () => {
        const elapsedSeconds =
          (Date.now() - state.startTime! - state.totalPausedDuration) / 1000;
        const elapsedMinutes = elapsedSeconds / 60;
        if (elapsedMinutes > 0) {
          const correctChars = getCorrectChars(state.userInput, state.text);
          const wpm = Math.min(
            Math.round(correctChars / 5 / elapsedMinutes),
            999
          );
          setCurrentWPM(wpm);
          const timeSeconds = Math.floor(elapsedSeconds);
          setWpmHistory((prev) => {
            const lastEntry = prev[prev.length - 1];
            if (lastEntry && lastEntry.time === timeSeconds) {
              return [...prev.slice(0, -1), { time: timeSeconds, wpm }];
            } else {
              return [...prev, { time: timeSeconds, wpm }];
            }
          });
        }
      };
      const interval = setInterval(calculateWPM, 100);
      calculateWPM();
      return () => clearInterval(interval);
    } else if (!state.isGameActive) {
      setWpmHistory([]);
    }
  }, [
    state.isGameActive,
    state.isGamePaused,
    state.startTime,
    state.userInput,
    state.text,
    getCorrectChars,
    state.totalPausedDuration,
  ]);

  // Game finish logic (timer)
  useEffect(() => {
    if (state.timer === 0 && state.isGameActive && !state.isGameFinished) {
      const calculateResults = () => {
        const endTime = Date.now();
        const duration = Math.floor(
          (endTime - (state.startTime || endTime) - state.totalPausedDuration) /
            1000
        );
        const typedChars = state.userInput.length;
        const correctChars = getCorrectChars(state.userInput, state.text);
        const accuracy =
          typedChars > 0 ? Math.round((correctChars / typedChars) * 100) : 0;
        const wpm =
          duration > 0
            ? Math.min(Math.round((correctChars / 5) / (duration / 60)), 999)
            : 0;
        return { wpm, accuracy, duration, wpmHistory };
      };
      const results = calculateResults();
      setTimeout(() => {
        setState((prev) => ({
          ...prev,
          isGameFinished: true,
          finalWPM: results.wpm,
          finalAccuracy: results.accuracy,
        }));
        onGameFinish?.(results);
      }, 0);
    }
  }, [
    state.timer,
    state.isGameActive,
    state.isGameFinished,
    state.userInput,
    state.text,
    state.startTime,
    onGameFinish,
    getCorrectChars,
    wpmHistory,
    state.totalPausedDuration,
  ]);

  // Game finish logic (text complete)
  useEffect(() => {
    if (
      state.userInput.length === state.text.length &&
      state.isGameActive &&
      !state.isGameFinished
    ) {
      const calculateResults = () => {
        const endTime = Date.now();
        const duration = Math.floor(
          (endTime - (state.startTime || endTime) - state.totalPausedDuration) /
            1000
        );
        const typedChars = state.userInput.length;
        const correctChars = getCorrectChars(state.userInput, state.text);
        const accuracy =
          typedChars > 0 ? Math.round((correctChars / typedChars) * 100) : 0;
        const wpm =
          duration > 0
            ? Math.min(Math.round((correctChars / 5) / (duration / 60)), 999)
            : 0;
        return { wpm, accuracy, duration, wpmHistory };
      };
      const results = calculateResults();
      setTimeout(() => {
        setState((prev) => ({
          ...prev,
          isGameFinished: true,
          finalWPM: results.wpm,
          finalAccuracy: results.accuracy,
        }));
        onGameFinish?.(results);
      }, 0);
    }
  }, [
    state.userInput,
    state.text,
    state.isGameActive,
    state.isGameFinished,
    state.startTime,
    onGameFinish,
    getCorrectChars,
    wpmHistory,
    state.totalPausedDuration,
  ]);

  const handleRestart = () => {
    setState({
      text: getRandomExcerpt(),
      userInput: "",
      startTime: null,
      timer: TIMER,
      isGameReady: true,
      isGameActive: false,
      isGamePaused: false,
      isGameFinished: false,
      pauseStartTime: null,
      totalPausedDuration: 0,
      finalWPM: 0,
      finalAccuracy: 0,
    });
    setCurrentWPM(0);
    setWpmHistory([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (state.isGameActive && !state.isGamePaused && !state.isGameFinished) {
        setState((prev) => ({
          ...prev,
          isGamePaused: true,
          pauseStartTime: Date.now(),
        }));
        inputRef.current?.blur();
      } else {
        handleRestart();
      }
      return;
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    return;
  };

  const handleClick = () => {
    if (!state.isGameFinished) {
      inputRef.current?.focus();
    }
  };

  const handleFocus = () => {
    if (state.isGamePaused) {
      setState((prev) => ({
        ...prev,
        isGamePaused: false,
        totalPausedDuration:
          prev.totalPausedDuration + (Date.now() - prev.pauseStartTime!),
        pauseStartTime: null,
      }));
    }
  };

  return (
    <div
      ref={gameContainerRef}
      className="flex flex-col size-full p-4 sm:p-6"
      onClick={handleClick}
    >
      <div className="size-full">
        <div className="relative">
          <div
            ref={textContainerRef}
            className="text-[0.6rem] sm:text-xl leading-relaxed wrap-break-word select-none h-32 sm:h-auto overflow-clip"
            role="textbox"
            aria-label="Text to type"
          >
            {state.text.split("").map((char, index) => {
              const userChar = state.userInput[index];
              
              let className: string;
              if (state.isGameReady) {
                className = "text-muted-foreground";
              } else if (userChar) {
                className =
                  userChar === char ? "text-foreground" : "text-destructive";
              } else {
                className = "text-muted-foreground/40";
              }

              return (
                <span key={index} data-char className={className}>
                  {char}
                </span>
              );
            })}
          </div>

          {!state.isGameReady && (
            <div
              className={`absolute w-[3px] h-6 pointer-events-none ${
                state.isGameFinished ? "bg-black dark:bg-white" : "bg-blue-500"
              } ${
                !isCursorMoving &&
                !state.isGameFinished &&
                !state.isGamePaused
                  ? "animate-blink"
                  : ""
              }`}
              style={{
                left: `${cursorPosition.left}px`,
                top: `${cursorPosition.top + 2}px`,
                transition: "left 0.1s ease-out, top 0.1s ease-out",
              }}
            />
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="text"
        value={state.userInput}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onFocus={handleFocus}
        disabled={state.isGameFinished || state.isGameReady}
        className="sr-only"
        aria-label="Type the text shown above"
      />

      <div
        className={`hidden sm:flex flex-row items-center justify-end gap-6 text-large w-full max-w-4xl transition-opacity opacity-100`}
      >
        {state.isGameReady ? (
          <button
            onClick={handleStartGame}
            className="w-auto text-center text-muted-foreground cursor-pointer hover:text-foreground transition-colors bg-transparent border-none p-0 text-large"
            aria-label="Start typing test"
          >
            Clickity-clackity
          </button>
        ) : state.isGamePaused ? (
          <span className="text-muted-foreground tabular-nums w-auto text-center">
            Paused
          </span>
        ) : (
          <>
            {state.isGameFinished ? (
              <span className="text-muted-foreground tabular-nums">{}</span>
            ) : (
              <span className="text-muted-foreground tabular-nums">
                {state.timer || 30}
              </span>
            )}
            <span className="text-muted-foreground tabular-nums w-36 text-right">
              {state.isGameFinished ? state.finalWPM : currentWPM} WPM
            </span>
            <button
              onClick={handleRestart}
              className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors bg-transparent border-none p-0"
              aria-label="Restart typing test"
            >
              Restart
            </button>
          </>
        )}
      </div>
    </div>
  );
}