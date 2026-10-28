export const LEADERBOARD_SIZE = 10;
export const SCORE_KEYS = ['mouth','teeth','motion','eyes'];

export function qualifies(entries, score) {
    return Number.isInteger(score) && score>0 && score<=1000
        && (entries.length<LEADERBOARD_SIZE || score>entries.at(-1).score);
}
export function playerName(value) {
    if(typeof value!=='string') return null;
    const name=value.normalize('NFKC').replace(/\s+/gu,' ').trim();
    return name && [...name].length<=24 && !/[\p{Cc}\p{Cf}]/u.test(name) ? name : null;
}
export function validScores(score, categories) {
    return Number.isInteger(score) && score>0 && score<=1000 && categories
        && SCORE_KEYS.every(key=>Number.isInteger(categories[key]) && categories[key]>=0 && categories[key]<=250)
        && SCORE_KEYS.reduce((sum,key)=>sum+categories[key],0)===score;
}
export function insertScore(entries, entry) {
    return [...entries,entry].sort((a,b)=>b.score-a.score || a.createdAt-b.createdAt).slice(0,LEADERBOARD_SIZE);
}
