/*
    StoryScout frontend prototype

    CURRENT:
    - Text input/output
    - Fake AI responses
    - Assignment planning UI

    LATER:
    Replace the fake responses with:
        1. Your Prologue API
        2. ElevenLabs conversational agent
        3. Backend transcript processing
*/


// ==============================
// ELEMENTS
// ==============================

const homePage =
    document.getElementById("homePage");

const interviewPage =
    document.getElementById("interviewPage");


const generateBtn =
    document.getElementById("generateBtn");


const sendBtn =
    document.getElementById("sendBtn");


const messageInput =
    document.getElementById("messageInput");


const chat =
    document.getElementById("chat");


const intervieweeInput =
    document.getElementById("interviewee");


const topicInput =
    document.getElementById("topic");


const goalInput =
    document.getElementById("goal");


const discoveriesInput =
    document.getElementById("discoveries");


// Sidebar elements

const sideInterviewee =
    document.getElementById("sideInterviewee");


const sideTopic =
    document.getElementById("sideTopic");


const sideGoal =
    document.getElementById("sideGoal");


const progressBar =
    document.getElementById("progressBar");


const progressText =
    document.getElementById("progressText");


// ==============================
// STATE
// ==============================

let interviewData = {

    interviewee: "",

    topic: "",

    goal: "",

    discoveries: ""

};


let messageCount = 0;


// ==============================
// GENERATE INTERVIEW
// ==============================

generateBtn.addEventListener(
    "click",
    startInterview
);


function startInterview() {

    interviewData.interviewee =
        intervieweeInput.value.trim();

    interviewData.topic =
        topicInput.value.trim();

    interviewData.goal =
        goalInput.value.trim();

    interviewData.discoveries =
        discoveriesInput.value.trim();


    /*
        In production:

        Send interviewData to your backend.

        Example:

        fetch("/api/create-assignment", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(interviewData)
        })

        The backend then calls Prologue.
    */


    updateSidebar();


    // Switch screens

    homePage.classList.add("hidden");

    interviewPage.classList.remove("hidden");


    // Reset conversation

    chat.innerHTML = "";

    messageCount = 0;


    addMessage(
        "ai",
        createOpeningQuestion()
    );


    updateProgress();
}


// ==============================
// OPENING QUESTION
// ==============================

function createOpeningQuestion() {

    if (interviewData.topic) {

        return `
            Thanks for joining me.

            I'd like to understand the story behind
            <strong>${escapeHTML(interviewData.topic)}</strong>.

            To start, what first made this important to you?
        `;

    }


    return `
        Thanks for joining me.

        To start, tell me a little about the story
        we're here to uncover.
    `;
}


// ==============================
// SIDEBAR
// ==============================

function updateSidebar() {

    sideInterviewee.textContent =
        interviewData.interviewee ||
        "Your interviewee";


    sideTopic.textContent =
        interviewData.topic ||
        "Your story topic";


    sideGoal.textContent =
        interviewData.goal ||
        "Discover the strongest story.";
}


// ==============================
// SEND MESSAGE
// ==============================

sendBtn.addEventListener(
    "click",
    sendMessage
);


messageInput.addEventListener(
    "keydown",
    function(event) {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendMessage();

        }

    }
);


function sendMessage() {

    const text =
        messageInput.value.trim();


    if (!text) {
        return;
    }


    // Add user message

    addMessage(
        "user",
        escapeHTML(text)
    );


    messageInput.value = "";


    messageCount++;


    updateProgress();


    // Simulate AI thinking

    showThinking();


    setTimeout(
        function() {

            removeThinking();

            const response =
                generateFollowUp(text);

            addMessage(
                "ai",
                response
            );

            messageCount++;

            updateProgress();

        },
        700
    );
}


// ==============================
// AI FOLLOW-UP DEMO
// ==============================

function generateFollowUp(answer) {

    const lower =
        answer.toLowerCase();


    /*
        These are intentionally simple
        prototype responses.

        Replace this entire function
        with your Prologue agent.

        The important behavior is:

            answer
              ↓
            detect interesting detail
              ↓
            follow up
    */


    if (
        lower.includes("father") ||
        lower.includes("mother") ||
        lower.includes("family")
    ) {

        return `
            You mentioned your family.

            I'd like to explore that a little more.
            What happened that made this personal for you?
        `;

    }


    if (
        lower.includes("failed") ||
        lower.includes("failure") ||
        lower.includes("mistake")
    ) {

        return `
            That's an important part of the story.

            What happened immediately after that,
            and how did it change what you did next?
        `;

    }


    if (
        lower.includes("customer") ||
        lower.includes("client")
    ) {

        return `
            Tell me more about that customer.

            Was there a particular moment when you realized
            that what you were building was actually working?
        `;

    }


    if (
        lower.includes("started") ||
        lower.includes("began") ||
        lower.includes("idea")
    ) {

        return `
            Take me back to that moment.

            What was happening in your life when you first
            realized you wanted to pursue this?
        `;

    }


    const genericQuestions = [

        `
        That's interesting.

        Can you give me a specific example of what happened?
        `,

        `
        What happened next?

        I'd like to understand that moment in a little more detail.
        `,

        `
        Why do you think that moment mattered so much?
        `,

        `
        Looking back now, what surprised you most about that experience?
        `,

        `
        If you had to describe the turning point in this story,
        what would it be?
        `

    ];


    return genericQuestions[
        messageCount %
        genericQuestions.length
    ];
}


// ==============================
// ADD CHAT MESSAGE
// ==============================

function addMessage(
    role,
    text
) {

    const bubble =
        document.createElement("div");


    bubble.className =
        `bubble ${role}`;


    bubble.innerHTML =
        text;


    chat.appendChild(bubble);


    // Automatically scroll

    bubble.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}


// ==============================
// THINKING INDICATOR
// ==============================

function showThinking() {

    const thinking =
        document.createElement("div");


    thinking.id =
        "thinkingBubble";


    thinking.className =
        "bubble ai";


    thinking.innerHTML =
        `
            <span class="thinking">
                ● ● ●
            </span>
        `;


    chat.appendChild(thinking);
}


function removeThinking() {

    const thinking =
        document.getElementById(
            "thinkingBubble"
        );


    if (thinking) {

        thinking.remove();

    }
}


// ==============================
// PROGRESS
// ==============================

function updateProgress() {

    /*
        Demo progression.

        Later this should come from
        the actual Prologue interview state.
    */

    let progress =
        18 + (messageCount * 12);


    progress =
        Math.min(progress, 88);


    progressBar.style.width =
        progress + "%";


    progressText.textContent =
        progress + "%";
}


// ==============================
// SECURITY
// ==============================

function escapeHTML(text) {

    const div =
        document.createElement("div");


    div.textContent =
        text;


    return div.innerHTML;
}