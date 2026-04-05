const API_URL = process.env.NEXT_PUBLIC_SHEETS_API_URL!;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || '';

    const res = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
    });

    const text = await res.text();

    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: 'Proxy GET failed',
        error: String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.text();

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body,
      redirect: 'follow',
    });

    const text = await res.text();

    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: 'Proxy POST failed',
        error: String(error),
      },
      { status: 500 }
    );
  }
}