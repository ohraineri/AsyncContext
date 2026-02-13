import { Context, withOpenAIContext } from "@marceloraineri/async-context";

type FakeRequest = { model: string; input: string };

type FakeResponse = {
  id: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  _request_id: string;
};

async function fakeOpenAICall(request: FakeRequest): Promise<FakeResponse> {
  return {
    id: "resp_1",
    model: request.model,
    usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
    _request_id: "req_1",
  };
}

async function main() {
  await Context.run({}, async () => {
    const response = await withOpenAIContext(
      "responses.create",
      { model: "gpt-4o", input: "Hello" },
      fakeOpenAICall,
      { includeRequest: true }
    );

    console.log("response id", response.id);
    console.log("openai context", Context.getValue("openai"));
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
