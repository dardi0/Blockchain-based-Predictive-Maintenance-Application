export default function Loading() {
    return (
        <div className="min-h-screen p-6 space-y-6 animate-pulse bg-[#060b14]">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between mb-8 max-w-7xl mx-auto w-full">
                <div className="h-8 w-64 bg-white/[0.04] rounded-lg"></div>
                <div className="flex gap-3">
                    <div className="h-10 w-32 bg-white/[0.04] rounded-lg"></div>
                    <div className="h-10 w-10 bg-white/[0.04] rounded-lg"></div>
                </div>
            </div>

            {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto w-full">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-32 bg-white/[0.03] border border-white/[0.07] rounded-xl"></div>
                ))}
            </div>

            {/* Main Content Area Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto w-full">
                <div className="lg:col-span-2 h-96 bg-white/[0.03] border border-white/[0.07] rounded-xl"></div>
                <div className="h-96 bg-white/[0.03] border border-white/[0.07] rounded-xl"></div>
            </div>

            {/* List Items Skeleton */}
            <div className="space-y-4 max-w-7xl mx-auto w-full">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-20 bg-white/[0.03] border border-white/[0.07] rounded-xl"></div>
                ))}
            </div>
        </div>
    );
}
