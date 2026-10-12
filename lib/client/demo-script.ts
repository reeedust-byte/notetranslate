/** A short scripted lecture (in English) used by demo mode, so the app can be tried without a microphone. */
export const DEMO_TITLE = "演示：梯度下降入门";
export const DEMO_COURSE = "CS 229 机器学习（演示）";

export const DEMO_SCRIPT: string[] = [
  "Okay everyone, let's get started. Today we're going to talk about gradient descent, which is probably the single most important optimization algorithm in machine learning.",
  "Last week we defined a loss function, which measures how badly our model fits the training data. Training a model just means finding the parameters that make this loss as small as possible.",
  "For linear regression we could solve that in closed form, but for almost every interesting model, like neural networks, there is no closed form solution. So we need an iterative method.",
  "Here's the intuition. Imagine you're standing on a hillside in thick fog and you want to get to the bottom of the valley. You can't see the valley, but you can feel the slope under your feet.",
  "So you take a small step in the direction that goes downhill most steeply, then you feel the slope again, and take another step. That's gradient descent.",
  "Mathematically, the gradient of the loss with respect to the parameters points in the direction of steepest increase. So we move in the opposite direction, the negative gradient.",
  "The update rule is: theta new equals theta old minus alpha times the gradient of the loss at theta old. Please write this down, this update rule will definitely be on the midterm.",
  "Alpha here is called the learning rate. It controls how big each step is, and choosing it well matters a lot in practice.",
  "If the learning rate is too small, training is painfully slow, you take millions of tiny steps. If it's too large, you overshoot the minimum and the loss can bounce around or even diverge to infinity.",
  "A common practical trick is to start with a learning rate like 0.1 or 0.01, watch the loss curve, and decrease it if the loss starts oscillating.",
  "Now, one problem. Computing the full gradient means summing over every single example in the training set. If you have a hundred million examples, every single step becomes extremely expensive.",
  "That's why in practice we use stochastic gradient descent, or SGD. Instead of the full dataset, we estimate the gradient from one example, or more commonly a small random mini batch, say 32 or 256 examples.",
  "The estimate is noisy, but it's unbiased, meaning on average it points in the right direction. And each step is thousands of times cheaper, so overall we make much faster progress.",
  "Interestingly, the noise can even help. It can knock the parameters out of sharp, bad regions of the loss surface, which some people think helps generalization.",
  "Another question students always ask: does gradient descent find the global minimum? For convex functions, like the loss for linear regression, yes, with a suitable learning rate it converges to the global minimum.",
  "For non-convex functions, like neural networks, there are no such guarantees. You might end up in a local minimum or a saddle point. In practice, though, for large networks this turns out to matter less than you'd expect.",
  "One more improvement before we stop: momentum. The idea is to keep a running average of past gradients, like a heavy ball rolling downhill that builds up speed.",
  "Momentum smooths out the zigzagging you get in narrow valleys and speeds up progress along directions where the gradient is consistent. Optimizers like Adam build on this same idea.",
  "Alright, to summarize: gradient descent repeatedly steps in the direction of the negative gradient, the learning rate controls the step size, and SGD with mini batches makes it practical for big datasets.",
  "For logistics, problem set two is due next Friday at midnight. It asks you to implement gradient descent from scratch in NumPy, so start early. See you on Thursday.",
];
