const inventoryQuestionPattern = /\b(who has|who owns|who can lend|what (?:items|tools)|what(?:'s| is) available|what do we have|anyone have|do we have|is there any|are there any|list (?:the )?(?:items|tools))\b/i
const transactionPattern = /\b(i need|i want|i have|i can lend|i can give|giving away|building|making)\b/i

type InventoryAnswer = {
    type: 'inventory_answer';
    snowflake: string;
    message: string;
};

export function isInventoryQuestion(text: string) {
    return !transactionPattern.test(text) && inventoryQuestionPattern.test(text);
}

export async function answerInventoryQuestion(text: string): Promise<string | null> {
    if (!isInventoryQuestion(text))
        return null;
    const base = (process.env.RELAY_API_URL?.trim() || 'http://127.0.0.1:8000').replace(/\/+$/, '');
    try {
        const response = await fetch(`${base}/api/agent/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text }),
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
            return "I can't verify neighborhood inventory right now because the inventory service is unavailable.";
        const result = await response.json() as InventoryAnswer | { type: 'not_inventory_question' };
        if (result.type === 'inventory_answer' && typeof result.message === 'string')
            return result.message;
    }
    catch { /* Do not fall back to the local demo inventory for factual questions. */ }
    return "I can't verify neighborhood inventory right now because the inventory service is unavailable.";
}