import { useState } from "react";
import { QUIZ } from "../data/content";

export function QuizTab() {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);

  const question = QUIZ[index];
  const score = answers.filter((answer, i) => answer === QUIZ[i].answer).length;

  const choose = (option: number) => {
    if (picked !== null) return;
    setPicked(option);
    setAnswers((current) => {
      const next = [...current];
      next[index] = option;
      return next;
    });
  };

  const next = () => {
    if (index + 1 >= QUIZ.length) {
      setFinished(true);
      return;
    }
    setIndex(index + 1);
    setPicked(null);
  };

  const restart = () => {
    setIndex(0);
    setPicked(null);
    setAnswers([]);
    setFinished(false);
  };

  if (finished) {
    const percent = Math.round((score / QUIZ.length) * 100);
    let comment = "Relisez les fiches et retentez : les automatismes viennent vite.";
    if (percent >= 90) comment = "Excellent — vous êtes prêt pour le TP.";
    else if (percent >= 70) comment = "Bonne base. Revoyez les questions manquées.";
    else if (percent >= 50) comment = "Les bases sont là, mais il faut réviser le DHCP/Snooping/DAI.";

    return (
      <div className="panel quiz-result">
        <p className="eyebrow">Résultat</p>
        <h2>
          {score} / {QUIZ.length} — {percent}%
        </h2>
        <div className="progress">
          <span style={{ width: `${percent}%` }} />
        </div>
        <p className="muted">{comment}</p>
        <ul className="quiz-review">
          {QUIZ.map((entry, i) => {
            const given = answers[i];
            const isOk = given === entry.answer;
            return (
              <li key={entry.id} className={isOk ? "ok" : "ko"}>
                <span className="check-icon">{isOk ? "✓" : "✕"}</span>
                <div>
                  <p className="check-label">{entry.question}</p>
                  {!isOk && (
                    <p className="check-detail">
                      Votre réponse : {entry.options[given] ?? "—"} · Bonne réponse :{" "}
                      {entry.options[entry.answer]}
                    </p>
                  )}
                  <p className="quiz-explain">{entry.explanation}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn" onClick={restart}>
          Recommencer
        </button>
      </div>
    );
  }

  const correct = picked !== null && picked === question.answer;

  return (
    <div className="panel quiz-panel">
      <div className="quiz-head">
        <p className="eyebrow">Question {index + 1} / {QUIZ.length}</p>
        <span className="quiz-score">
          {answers.filter((answer, i) => answer === QUIZ[i].answer).length} bonne(s)
        </span>
      </div>
      <div className="progress thin">
        <span style={{ width: `${(index / QUIZ.length) * 100}%` }} />
      </div>

      <h2 className="quiz-question">{question.question}</h2>

      <div className="quiz-options">
        {question.options.map((option, i) => {
          const isPicked = picked === i;
          const isAnswer = question.answer === i;
          const state =
            picked === null
              ? ""
              : isAnswer
                ? "correct"
                : isPicked
                  ? "wrong"
                  : "muted";
          return (
            <button
              key={option}
              type="button"
              className={`quiz-option ${state}`}
              onClick={() => choose(i)}
              disabled={picked !== null}
            >
              <span className="quiz-letter">
                {String.fromCharCode(65 + i)}
              </span>
              {option}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className={`quiz-feedback ${correct ? "ok" : "ko"}`}>
          <strong>{correct ? "Correct" : "Pas tout à fait"}</strong>
          <p>{question.explanation}</p>
          <button type="button" className="btn" onClick={next}>
            {index + 1 >= QUIZ.length ? "Voir le résultat" : "Question suivante"}
          </button>
        </div>
      )}
    </div>
  );
}
