/* Exact binomial upper tail for research. Does not detect watermarks. */
export function binomialTail(n,k,p){
 if(!Number.isSafeInteger(n)||n<1||n>100000||!Number.isSafeInteger(k)||k<0||k>n||!Number.isFinite(p)||p<=0||p>=1)throw new RangeError("Invalid n, k, or p");
 if(k===0)return 1;
 const lp=Math.log(p),lq=Math.log1p(-p);
 const term=j=>{let v=0;for(let i=1;i<=j;i++)v+=Math.log(n-i+1)-Math.log(i);return v+j*lp+(n-j)*lq;};
 const sum=(a,b)=>{let log=term(a),max=-Infinity,acc=0;for(let j=a;j<=b;j++){if(log>max){acc=acc*Math.exp(max-log)+1;max=log;}else acc+=Math.exp(log-max);if(j<b)log+=Math.log(n-j)-Math.log(j+1)+lp-lq;}return Math.exp(max)*acc;};
 return Math.max(0,Math.min(1,k>n*p?sum(k,n):1-sum(0,k-1)));
}
export function evaluateCounts({trials,green,gamma}){
 const n=Number(trials),k=Number(green),p=Number(gamma),tail=binomialTail(n,k,p);
 return {method:"exact-binomial-upper-tail",trials:n,green:k,gamma:p,observedRate:k/n,expectedRate:p,zScore:(k-n*p)/Math.sqrt(n*p*(1-p)),pValue:tail,interpretation:"Only valid for green-token counts from a verified compatible keyed detector, under its null assumptions. A small p-value is not proof of AI authorship."};
}