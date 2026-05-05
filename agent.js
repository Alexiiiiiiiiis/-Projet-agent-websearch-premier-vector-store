import 'dotenv/config';

async function runAgent(tools, toolFunctions, userMessageOrHistory) {
  const messages = Array.isArray(userMessageOrHistory)
    ? userMessageOrHistory
    : [{ role: 'user', content: userMessageOrHistory }];

  let iterations = 0;

  while (iterations < 10) {
    iterations++;
    const callStart = Date.now();

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages,
        tools,
        tool_choice: 'auto'
      })
    });

    const data = await response.json();
    const choice = data.choices[0];

    console.log(`[Agent] Tour ${iterations} — ${data.usage?.total_tokens ?? '?'} tokens, ${Date.now() - callStart}ms`);

    messages.push(choice.message);

    if (choice.finish_reason === 'stop') {
      const content = choice.message.content;
      if (Array.isArray(content)) {
        return content
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join('');
      }
      return content;
    }

    if (choice.finish_reason === 'tool_calls') {
      for (const toolCall of choice.message.tool_calls) {
        const fn = toolFunctions[toolCall.function.name];
        const args = JSON.parse(toolCall.function.arguments);

        const result = await fn(args);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
    }
  }

  return "Limite d'itérations atteinte sans réponse finale.";
}

export { runAgent };
