import esbuild from 'esbuild';

esbuild.build({
    entryPoints: ['src/index.js'],
    bundle: true,
    outfile: 'build/main.js',
    external: [
        "obsidian",
    ],
}).then(() => {
    console.log('✅ 빌드가 완료되었습니다!');
}).catch(() => {
    console.error('❌ 빌드 중 에러가 발생했습니다.');
    process.exit(1);
});