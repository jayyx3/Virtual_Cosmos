import React from "react";

type State = {
  hasError: boolean;
  message: string;
};

type Props = {
  children: React.ReactNode;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : "Unknown runtime error";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown): void {
    console.error("[app] render crash", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="join-screen">
          <section>
            <h1>Runtime Error</h1>
            <p>The UI crashed after loading. Please share this message:</p>
            <p className="join-error">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
            >
              Reload
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
