import { useState, useRef, useEffect } from "react";
import styles from "@/styles/AI.module.scss";
import { BsStars } from "react-icons/bs";
import { IoSend } from "react-icons/io5";
import {
  FaRobot,
  FaUser,
  FaFilm,
  FaTv,
  FaTheaterMasks,
  FaLaugh,
  FaHeart,
  FaBolt,
} from "react-icons/fa";
import { getContinueWatching } from "@/Utils/continueWatching";
import { getBookmarks } from "@/Utils/bookmark";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const QUICK_ACTIONS = [
  {
    icon: FaBolt,
    text: "What's trending right now?",
    query: "What are the top trending movies and TV shows right now?",
  },
  {
    icon: FaHeart,
    text: "Feel-good movies",
    query: "Recommend some feel-good movies that will lift my mood",
  },
  {
    icon: FaTheaterMasks,
    text: "Hidden gems",
    query: "What are some underrated hidden gem movies I might have missed?",
  },
  {
    icon: FaFilm,
    text: "Best thrillers",
    query: "What are the best thriller movies of the last few years?",
  },
  {
    icon: FaTv,
    text: "Binge-worthy shows",
    query: "What TV shows are so good I'll want to binge-watch them?",
  },
  {
    icon: FaLaugh,
    text: "Comedy night",
    query: "Suggest some great comedy movies for a fun night in",
  },
];

const AIPage = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 96)}px`;
    }
  }, [input]);

  const getViewingContext = (): string => {
    try {
      const continueWatching = getContinueWatching();
      const bookmarks = getBookmarks(null) as any;

      const parts: string[] = [];

      if (continueWatching?.movie?.length > 0) {
        parts.push(
          `Recently watched movies (IDs): ${continueWatching.movie.slice(0, 5).join(", ")}`,
        );
      }
      if (continueWatching?.tv?.length > 0) {
        parts.push(
          `Recently watched TV shows (IDs): ${continueWatching.tv.slice(0, 5).join(", ")}`,
        );
      }
      if (bookmarks?.movie?.length > 0) {
        parts.push(`Bookmarked movies (IDs): ${bookmarks.movie.join(", ")}`);
      }
      if (bookmarks?.tv?.length > 0) {
        parts.push(`Bookmarked TV shows (IDs): ${bookmarks.tv.join(", ")}`);
      }

      return parts.length > 0 ? parts.join("\n") : "";
    } catch {
      return "";
    }
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const allMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const viewingContext = getViewingContext();

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages.slice(-20), // Keep last 20 messages for context
          viewingContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `⚠️ ${error.message || "Something went wrong. Please check that your OPENAI_API_KEY is configured and try again."}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatContent = (content: string) => {
    // Simple markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br/>");
  };

  return (
    <div className={styles.aiPage}>
      <div className={styles.aiContainer}>
        <div className={styles.aiHeader}>
          <div className={styles.aiLogo}>
            <BsStars />
          </div>
          <div className={styles.aiTitle}>
            <h1>Open Stream AI</h1>
            <p>Your personal streaming assistant</p>
          </div>
          <div className={styles.aiStatus}>
            <span className={styles.statusDot}></span>
            Online
          </div>
        </div>

        <div className={styles.messagesContainer}>
          {messages.length === 0 ? (
            <div className={styles.welcomeMessage}>
              <div className={styles.welcomeIcon}>
                <BsStars />
              </div>
              <h2>Hey there! 👋</h2>
              <p>
                I&apos;m your AI streaming assistant. Ask me anything about
                movies and TV shows — I can recommend content based on your
                mood, find hidden gems, or help you discover your next favorite
                watch.
              </p>
              <div className={styles.quickActions}>
                {QUICK_ACTIONS.map((action, i) => (
                  <button
                    key={i}
                    className={styles.quickAction}
                    onClick={() => sendMessage(action.query)}
                  >
                    <action.icon className={styles.actionIcon} />
                    {action.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`${styles.message} ${message.role}`}
                >
                  <div className={styles.avatar}>
                    {message.role === "user" ? <FaUser /> : <FaRobot />}
                  </div>
                  <div
                    className={styles.messageBubble}
                    dangerouslySetInnerHTML={{
                      __html: formatContent(message.content),
                    }}
                  />
                </div>
              ))}
              {isLoading && (
                <div className={`${styles.message} ${styles.assistant}`}>
                  <div className={styles.avatar}>
                    <FaRobot />
                  </div>
                  <div
                    className={`${styles.messageBubble} ${styles.typingIndicator}`}
                  >
                    <span className={styles.dot}></span>
                    <span className={styles.dot}></span>
                    <span className={styles.dot}></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className={styles.inputContainer}>
          <div className={styles.inputWrapper}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about movies, shows, or what to watch..."
              rows={1}
              disabled={isLoading}
            />
            <button
              className={styles.sendButton}
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
            >
              <IoSend />
            </button>
          </div>
          <p className={styles.inputHint}>
            Press Enter to send • Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
};

export default AIPage;
