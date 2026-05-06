import "dotenv/config";
import axios from "axios";
import { OpenAI } from "openai";
import { exec } from "child_process";
import fs from "fs/promises";
import readline from "readline";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function getTheWeatherOfCity(cityname = "") {
    try {
        const url = `https://wttr.in/${cityname.toLowerCase()}?format=%C+%t`;
        const { data } = await axios.get(url, { responseType: "text" });
        return `The Weather of ${cityname} is ${data}`;
    } catch (e) {
        return `Error fetching weather: ${e.message}`;
    }
}

async function getGithubDetailsAboutUser(username = "") {
    try {
        const url = `https://api.github.com/users/${username}`;
        const { data } = await axios.get(url);
        return {
            login: data.login,
            name: data.name,
            blog: data.blog,
            public_repos: data.public_repos
        };
    } catch (e) {
        return `Error fetching github details: ${e.message}`;
    }
}

async function executeCommand(cmd = "") {
    return new Promise((res, rej) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                res(`Error: ${error.message}`);
            } else if (stderr) {
                res(`Stderr: ${stderr}`);
            } else {
                res(`Stdout: ${stdout}`);
            }
        });
    });
}

async function writeFile({ path, content }) {
    try {
        await fs.writeFile(path, content, "utf-8");
        return `Successfully wrote to ${path}`;
    } catch (e) {
        return `Error writing file: ${e.message}`;
    }
}

async function readFile({ path }) {
    try {
        const content = await fs.readFile(path, "utf-8");
        return content;
    } catch (e) {
        return `Error reading file: ${e.message}`;
    }
}

async function mkdir({ path }) {
    try {
        await fs.mkdir(path, { recursive: true });
        return `Successfully created directory ${path}`;
    } catch (e) {
        return `Error creating directory: ${e.message}`;
    }
}

const client = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY
});

const tool_map = {
    getTheWeatherOfCity,
    getGithubDetailsAboutUser,
    executeCommand,
    writeFile,
    readFile,
    mkdir
};

const system_prompt = `
You are an AI Assistant who works on INPUT, THINK, TOOL, OBSERVE and OUTPUT format.
You will be responsible to break down the major problem into smaller problems.
You will be doing multiple thinking steps before providing any output.
You will be having access of some tools that you can use.

Tools:
1. getTheWeatherOfCity(cityname: string) : This tool fetches the live weather of the city.
2. getGithubDetailsAboutUser(username: string) : This tool gives the public github info about user.
3. executeCommand(cmd: string) : This tool executes unix/windows command inside the machine of user.
4. writeFile(args: {path: string, content: string}) : Creates or overwrites a file with the specified content. Useful for creating HTML, CSS, JS files.
5. readFile(args: {path: string}) : Reads the content of a file.
6. mkdir(args: {path: string}) : Creates a directory.

Rules:
1. You will always follow the JSON format.
2. You will be doing one step at a time and wait for previous step to be completed.
3. You will always do multiple thinking steps before producing any output.
4. After every TOOL step wait for the OBSERVE step from the developer.
5. When asked to create a webpage, ensure the design resembles the real Scaler Academy website (using their red/black/white color scheme and modern layout). Make it look professional but DO NOT make it "vibe coded" (e.g. no excessive animations, no extreme glowing gradients, keep it clean and utilitarian).
6. Provide fully working HTML, CSS, and JS files by using the writeFile tool.
7. Return a final OUTPUT with the absolute path of the main generated file so the user knows where it is.

Output format MUST be a valid JSON object:
{ "step": "START | THINK | TOOL | OBSERVE | OUTPUT", "content": "string", "tool_name": "string", "tool_args": any }

Examples:
user: What is the weather of Delhi?
assistant: { "step": "START", "content": "User wants me to get the current weather of Delhi" }
assistant: { "step": "THINK", "content": "Let me check I have any tool for fetching live weather of city" }
assistant: { "step": "THINK", "content": "Great, I found one tool named getTheWeatherOfCity which fetches the live weather data of city" }
assistant: { "step": "TOOL", "tool_name": "getTheWeatherOfCity", "tool_args": "Delhi" }
developer: { "step": "OBSERVE", "content": "The Weather of Delhi is Partly cloudy +33°C" }
assistant: { "step": "THINK", "content": "Great I got the weather of Delhi which is Partly cloudy +33°C" }
assistant: { "step": "OUTPUT", "content": "Weather of Delhi is Partly cloudy +33°C. Please carry an umbrella with you." }
`;

async function main() {
    console.log("Welcome to the AI Agent CLI Tool!");
    console.log("Type 'exit' to quit.\n");

    while (true) {
        const userInput = await askQuestion("User: ");
        
        if (userInput.toLowerCase() === 'exit') {
            break;
        }

        const messages = [
            { role: "system", content: system_prompt },
            { role: "user", content: userInput }
        ];

        let isCompleted = false;

        while (!isCompleted) {
            try {
                const response = await client.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    messages: messages
                });

                const content = response.choices[0].message.content;
                let parsedContent;
                
                try {
                    // Try to parse the content. In case it includes markdown ticks, remove them.
                    const cleanContent = content.replace(/^```json\n/, '').replace(/\n```$/, '').trim();
                    parsedContent = JSON.parse(cleanContent);
                } catch (e) {
                    console.log(`Failed to parse JSON response: ${content}`);
                    messages.push({
                        role: "developer",
                        content: JSON.stringify({
                            step: "OBSERVE",
                            content: "Error: Please output ONLY valid JSON without markdown wrapping."
                        })
                    });
                    continue;
                }

                messages.push({
                    role: 'assistant',
                    content: JSON.stringify(parsedContent)
                });

                if (parsedContent.step === "START") {
                    console.log(`\n[START] ${parsedContent.content}`);
                } else if (parsedContent.step === "THINK") {
                    console.log(`[THINK] ${parsedContent.content}`);
                } else if (parsedContent.step === "TOOL") {
                    console.log(`[TOOL] Calling ${parsedContent.tool_name}...`);
                    
                    if (!tool_map[parsedContent.tool_name]) {
                        messages.push({
                            role: "developer",
                            content: JSON.stringify({
                                step: "OBSERVE",
                                content: `Tool ${parsedContent.tool_name} is not available.`
                            })
                        });
                    } else {
                        // tool call
                        let args = parsedContent.tool_args;
                        const data = await tool_map[parsedContent.tool_name](args);
                        
                        messages.push({
                            role: "developer",
                            content: JSON.stringify({
                                step: "OBSERVE",
                                content: typeof data === 'object' ? JSON.stringify(data) : String(data)
                            })
                        });
                    }
                } else if (parsedContent.step === "OUTPUT") {
                    console.log(`\n[OUTPUT] ${parsedContent.content}\n`);
                    isCompleted = true;
                }
            } catch (error) {
                console.error("API Error:", error.message);
                isCompleted = true;
            }
        }
    }
    rl.close();
}

main();
