import React from 'react';

export const BackgroundAmbience = () => (
    <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#c5a059]/10 blur-[120px] rounded-full opacity-30 dark:opacity-100" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-[#4f46e5]/10 blur-[120px] rounded-full opacity-30 dark:opacity-100" />
    </div>
);
