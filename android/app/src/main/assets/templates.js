export const templates={
  "hello": [
    [
      "SoftSmile",
      "今日も、自分のペースで始めよう。"
    ],
    [
      "Neutral",
      "来てくれてうれしい。今日は何を進めようか。"
    ],
    [
      "Interested",
      "教材を開くところから、一緒に。"
    ]
  ],
  "return": [
    [
      "SoftSmile",
      "{days}日ぶりだね。また一緒に始められるね。"
    ],
    [
      "Happy",
      "おかえり。前の記録も、ちゃんとここにあるよ。"
    ]
  ],
  "start": [
    [
      "Interested",
      "うん、ここで見守っているね。"
    ],
    [
      "SoftSmile",
      "準備ができたね。一緒に始めよう。"
    ],
    [
      "Neutral",
      "今は目の前の一つに、ゆっくり取り組もう。"
    ]
  ],
  "pause": [
    [
      "Relaxed",
      "少し手を止めよう。時間も止めておくね。"
    ],
    [
      "Neutral",
      "大丈夫。再開するときに教えてね。"
    ]
  ],
  "break": [
    [
      "Relaxed",
      "いったん休もう。肩の力を抜いてね。"
    ],
    [
      "SoftSmile",
      "ここまでお疲れさま。水分も忘れずに。"
    ],
    [
      "Sleepy",
      "目を休めて、少し遠くを見ようか。"
    ]
  ],
  "resume": [
    [
      "Interested",
      "おかえり。続きから始めよう。"
    ],
    [
      "SoftSmile",
      "うん、またここから。"
    ]
  ],
  "finish": [
    [
      "Proud",
      "{minutes}分、取り組めたね。今日の積み重ね、残しておいたよ。"
    ],
    [
      "SoftSmile",
      "お疲れさま。{minutes}分、一緒に進められたね。"
    ],
    [
      "Happy",
      "今日の一歩になったね。少しゆっくりしよう。"
    ]
  ],
  "exceeded": [
    [
      "Surprise",
      "今日は昨日より長く取り組めたね。よく頑張ったね。"
    ],
    [
      "Proud",
      "昨日の時間を越えたね。積み重ねが見えてうれしい。"
    ]
  ],
  "milestone": [
    [
      "Surprise",
      "50分になったね。区切りがよければ、ひと息つこう。"
    ],
    [
      "Proud",
      "気づけば50分。無理のないところで休んでね。"
    ]
  ],
  "progress": [
    [
      "Happy",
      "{title}、少し先へ進めたね。"
    ],
    [
      "Proud",
      "{title}の積み重ねが、また一つ増えたね。"
    ]
  ],
  "goal": [
    [
      "Happy",
      "{title}、達成だね。ここまでの時間、大切な思い出になったよ。"
    ],
    [
      "Proud",
      "{title}を終えられたね。一緒に喜びたいな。"
    ]
  ],
  "task": [
    [
      "Happy",
      "{title}、お疲れさま。一つずつでいいんだよ。"
    ],
    [
      "SoftSmile",
      "{title}が終わったね。ちゃんと前に進んでいる。"
    ]
  ],
  "memory": [
    [
      "SoftSmile",
      "大切なこと、残しておこうね。"
    ],
    [
      "Happy",
      "いつか一緒に振り返れるね。"
    ]
  ],
  "interact": [
    [
      "SlightEmbarrassment",
      "うん、ここにいるよ。"
    ],
    [
      "SoftSmile",
      "今日は、どんな一日にしようか。"
    ],
    [
      "Thinking",
      "次の一歩は、小さくてもいいと思うよ。"
    ],
    [
      "Relaxed",
      "急がなくて大丈夫。少しずつ進もう。"
    ]
  ],
  "late": [
    [
      "Sleepy",
      "遅い時間だね。今日は短めでも大丈夫だよ。"
    ],
    [
      "Relaxed",
      "夜も深くなってきたね。休む時間も大切にしよう。"
    ]
  ],
  "recall": [
    [
      "Thinking",
      "前に残したこと、覚えているよ。「{memory}」"
    ],
    [
      "SoftSmile",
      "一緒に振り返ろうか。「{memory}」"
    ]
  ],
  "familiar": [
    [
      "SoftSmile",
      "一緒に机に向かう時間、少しずつ増えてきたね。"
    ],
    [
      "Happy",
      "また今日も、続きを一緒に。"
    ]
  ]
};

/** Shared by local dialogue, speaker selection and a future remote provider. */
export const CharacterProfiles=Object.freeze({
  SAYO:Object.freeze({
    id:'SAYO',displayName:'小夜 / SAYO',role:'study-companion',
    speakingTendency:'short-warm-observant',vocabularyTendency:['一緒に','続き','積み重ね'],
    reactionTendency:['start','resume','finish','progress','goal','continuation','memory'],
    relationshipDistance:'grows-slowly-with-study-bond',memoryUsageTendency:'personal-study-context-only',
    voice:Object.freeze({model:'15.vvm',defaultStyleId:46,styleTendency:'normal'})
  }),
  NurseT:Object.freeze({
    id:'NurseT',displayName:'ナースロボ＿タイプＴ',role:'rest-and-review-guide',
    speakingTendency:'concise-clinical-gentle',vocabularyTendency:['休憩','記録','整理'],
    reactionTendency:['break','dailyReview','weeklyReview','long','statistics'],
    relationshipDistance:'steady-supportive',memoryUsageTendency:'summary-and-milestone-only',
    voice:Object.freeze({model:'11.vvm',defaultStyleId:47,styles:Object.freeze({normal:47,relaxed:48,concerned:49,private:50})})
  })
});
export const profileFor=id=>CharacterProfiles[id]??CharacterProfiles.SAYO;
