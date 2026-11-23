export default function DashboardPage() {
  const { address } = useWallet();
  const dashboardData = useMemo(
    () => buildDashboardData(address ?? FALLBACK_DASHBOARD_SEED),
    [address],
  );
  const {
    stats,
    reputationTier,
    activePredictions,
    upcomingResolutions,
    recentActivity,
  } = dashboardData;

  const storageKey = `${WIDGET_ORDER_STORAGE_PREFIX}:${address ?? FALLBACK_DASHBOARD_SEED}`;
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>([
    ...DEFAULT_WIDGET_ORDER,
  ]);
  const [draggedWidget, setDraggedWidget] = useState<WidgetId | null>(null);
  const moveButtonRefs = useRef<
    Partial<Record<string, HTMLButtonElement | null>>
  >({});
  // Set when a keyboard move re-renders the list, so focus stays on the widget.
  const pendingFocusWidget = useRef<WidgetId | null>(null);

  useEffect(() => {
    setWidgetOrder(readWidgetOrder(storageKey));
  }, [storageKey]);

  useEffect(() => {
    const widget = pendingFocusWidget.current;
    if (!widget) return;
    pendingFocusWidget.current = null;

    // The up button is disabled at the top, so fall back to the down button.
    const button =
      widgetOrder.indexOf(widget) > 0
        ? moveButtonRefs.current[`${widget}-up`]
        : moveButtonRefs.current[`${widget}-down`];
    button?.focus();
  }, [widgetOrder]);

  const moveWidget = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    const next = [...widgetOrder];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    setWidgetOrder(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const handleKeyboardMove = (widget: WidgetId, delta: -1 | 1) => {
    const index = widgetOrder.indexOf(widget);
    const target = index + delta;
    if (target < 0 || target >= widgetOrder.length) return;

    pendingFocusWidget.current = widget;
    moveWidget(index, target);
  };

  const handleDrop = (targetWidget: WidgetId) => {
    if (!draggedWidget) return;

    moveWidget(
      widgetOrder.indexOf(draggedWidget),
      widgetOrder.indexOf(targetWidget),
    );
    setDraggedWidget(null);
  };

  const widgets: Record<WidgetId, ReactNode> = {
    stats: (
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-orange-500/40"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-white/90 text-sm font-medium">
                {item.label}
              </h3>
              {item.label === "Reputation Score" ? (
                <span className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-400">
                  {reputationTier}
                </span>
              ) : null}
            </div>
            <p className={["mt-3 text-3xl font-bold", item.accent].join(" ")}>
              {item.value}
            </p>
          </div>
        ))}
      </section>
    ),
    predictions: (
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-white font-semibold">Active Predictions</h3>
            <Link
              href="/my-predictions"
              className="text-sm font-medium text-orange-300 transition hover:text-orange-200"
            >
              View All
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {activePredictions.map((prediction) => (
              <div
                key={prediction.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <p className="text-white font-medium">{prediction.title}</p>
                    <p className="text-sm text-gray-400">
                      Outcome:{" "}
                      <span className="text-white">{prediction.outcome}</span> •
                      Stake:{" "}
                      <span className="text-white">{prediction.stake}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-gray-200">
                      {prediction.timeRemaining} left
                    </span>
                    <span className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 font-semibold text-orange-400">
                      {prediction.probability} prob.
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-white font-semibold">Upcoming Resolutions</h3>
            <div className="mt-4 space-y-3">
              {upcomingResolutions.map((market) => (
                <div
                  key={market.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <p className="text-sm font-medium text-white">
                    {market.title}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">{market.ended}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    ),
    competitions: <CompetitionsJoined />,
    "quick-actions": <QuickActions />,
    activity: (
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-white font-semibold">Recent Activity</h3>
        <ol className="mt-5 space-y-3">
          {recentActivity.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">{item.label}</p>
                <p className="text-xs text-gray-400">{item.meta}</p>
              </div>
              <span className="inline-flex self-start rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-gray-200 sm:self-center">
                {item.badge}
              </span>
            </li>
          ))}
        </ol>
      </section>
    ),
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {widgetOrder.map((widget, index) => {
        const label = WIDGET_LABELS[widget];

        return (
          <div
            key={widget}
            draggable
            onDragStart={() => setDraggedWidget(widget)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handleDrop(widget);
            }}
            onDragEnd={() => setDraggedWidget(null)}
            className={draggedWidget === widget ? "opacity-50" : undefined}
          >
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <GripVertical className="h-4 w-4" aria-hidden="true" />
                {label}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  ref={(node) => {
                    moveButtonRefs.current[`${widget}-up`] = node;
                  }}
                  onClick={() => handleKeyboardMove(widget, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${label} up`}
                  className="rounded-lg border border-white/10 bg-white/5 p-1 text-gray-200 transition hover:border-orange-500/40 disabled:opacity-40"
                >
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  ref={(node) => {
                    moveButtonRefs.current[`${widget}-down`] = node;
                  }}
                  onClick={() => handleKeyboardMove(widget, 1)}
                  disabled={index === widgetOrder.length - 1}
                  aria-label={`Move ${label} down`}
                  className="rounded-lg border border-white/10 bg-white/5 p-1 text-gray-200 transition hover:border-orange-500/40 disabled:opacity-40"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            {widgets[widget]}
          </div>
        );
      })}
    </div>
  );
}
